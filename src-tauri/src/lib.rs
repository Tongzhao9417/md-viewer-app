use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
struct FilePayload {
    path: String,
    content: String,
}

#[derive(Clone, Serialize)]
struct MarkdownFileEntry {
    path: String,
    name: String,
    relative_path: String,
}

#[derive(Clone, Serialize)]
struct WorkspacePayload {
    root: String,
    name: String,
    files: Vec<MarkdownFileEntry>,
}

struct AppState {
    current_file: Mutex<Option<PathBuf>>,
    watched_files: Mutex<HashSet<PathBuf>>,
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension().map_or(false, |ext| {
        matches!(
            ext.to_string_lossy().to_ascii_lowercase().as_str(),
            "md" | "markdown" | "mdx" | "mkd"
        )
    })
}

fn should_skip_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().map(|name| name.to_string_lossy()) else {
        return false;
    };

    if name.starts_with('.') {
        return true;
    }

    matches!(
        name.as_ref(),
        ".git" | ".pnpm-store" | "dist" | "dist-ssr" | "node_modules" | "target"
    )
}

fn should_skip_file(path: &Path) -> bool {
    path.file_name()
        .map(|name| name.to_string_lossy().starts_with('.'))
        .unwrap_or(false)
}

fn read_md_file(path: &PathBuf) -> Result<FilePayload, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(FilePayload {
        path: path.to_string_lossy().to_string(),
        content,
    })
}

fn relative_path_string(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn path_parts(path: &str) -> Vec<String> {
    let mut normalized = path.replace('\\', "/");
    if normalized.len() >= 3 && normalized.as_bytes()[1] == b':' && normalized.as_bytes()[2] == b'/'
    {
        normalized = normalized[3..].to_string();
    }

    normalized
        .trim_matches('/')
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .map(ToString::to_string)
        .collect()
}

fn existing_file(path: PathBuf) -> Option<String> {
    if !path.is_file() {
        return None;
    }

    Some(
        fs::canonicalize(&path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string(),
    )
}

fn candidate_from_suffix(root: &Path, suffix: &[String]) -> Option<String> {
    if suffix.is_empty() {
        return None;
    }

    let mut candidate = root.to_path_buf();
    for part in suffix {
        candidate.push(part);
    }

    existing_file(candidate)
}

fn unique_candidate(candidates: Vec<String>) -> Option<String> {
    let unique: HashSet<String> = candidates.into_iter().collect();
    if unique.len() == 1 {
        unique.into_iter().next()
    } else {
        None
    }
}

fn fallback_roots(document_path: Option<String>, workspace_root: Option<String>) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(root) = workspace_root {
        let path = PathBuf::from(root);
        if path.is_dir() {
            roots.push(path);
        }
    }

    if let Some(path) = document_path {
        let path = PathBuf::from(path);
        if let Some(parent) = path.parent() {
            if parent.is_dir() && !roots.iter().any(|root| root == parent) {
                roots.push(parent.to_path_buf());
            }
        }
    }

    roots
}

fn resolve_by_workspace_suffix(path: &str, roots: &[PathBuf]) -> Option<String> {
    let parts = path_parts(path);
    if parts.is_empty() || roots.is_empty() {
        return None;
    }

    for root in roots {
        let Some(root_name) = root.file_name().map(|name| name.to_string_lossy()) else {
            continue;
        };

        for (index, part) in parts.iter().enumerate() {
            if part.eq_ignore_ascii_case(root_name.as_ref()) {
                if let Some(candidate) = candidate_from_suffix(root, &parts[index + 1..]) {
                    return Some(candidate);
                }
            }
        }
    }

    for start in 0..parts.len() {
        let candidates = roots
            .iter()
            .filter_map(|root| candidate_from_suffix(root, &parts[start..]))
            .collect::<Vec<_>>();

        if let Some(candidate) = unique_candidate(candidates) {
            return Some(candidate);
        }
    }

    None
}

#[tauri::command]
fn get_initial_file(state: tauri::State<AppState>) -> Option<FilePayload> {
    let guard = state.current_file.lock().unwrap();
    guard.as_ref().and_then(|p| read_md_file(p).ok())
}

#[tauri::command]
fn open_file(
    path: String,
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<FilePayload, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }
    let payload = read_md_file(&path_buf)?;
    *state.current_file.lock().unwrap() = Some(path_buf.clone());

    let mut watched = state.watched_files.lock().unwrap();
    if !watched.contains(&path_buf) {
        watched.insert(path_buf.clone());
        start_watcher(app, path_buf);
    }

    Ok(payload)
}

fn collect_markdown_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<MarkdownFileEntry>,
) -> Result<(), String> {
    if files.len() >= 1000 {
        return Ok(());
    }

    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            if !should_skip_dir(&path) {
                collect_markdown_files(root, &path, files)?;
            }
            continue;
        }

        if !path.is_file() || should_skip_file(&path) || !is_markdown_file(&path) {
            continue;
        }

        let relative = relative_path_string(root, &path);
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| relative.clone());

        files.push(MarkdownFileEntry {
            path: path.to_string_lossy().to_string(),
            name,
            relative_path: relative,
        });
    }

    Ok(())
}

#[tauri::command]
fn list_markdown_files(path: String) -> Result<WorkspacePayload, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path not found: {}", path));
    }

    let root = if path_buf.is_dir() {
        path_buf.clone()
    } else {
        path_buf
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| format!("No parent directory: {}", path))?
    };

    let mut files = Vec::new();
    if path_buf.is_file() {
        if !should_skip_file(&path_buf) && is_markdown_file(&path_buf) {
            let relative = relative_path_string(&root, &path_buf);
            let name = path_buf
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| relative.clone());
            files.push(MarkdownFileEntry {
                path: path_buf.to_string_lossy().to_string(),
                name,
                relative_path: relative,
            });
        }
    } else if !should_skip_dir(&path_buf) {
        collect_markdown_files(&root, &root, &mut files)?;
    }

    files.sort_by(|a, b| {
        a.relative_path
            .to_ascii_lowercase()
            .cmp(&b.relative_path.to_ascii_lowercase())
    });

    Ok(WorkspacePayload {
        root: root.to_string_lossy().to_string(),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string()),
        files,
    })
}

#[tauri::command]
fn resolve_image_path(
    path: String,
    document_path: Option<String>,
    workspace_root: Option<String>,
) -> Option<String> {
    if let Some(path) = existing_file(PathBuf::from(&path)) {
        return Some(path);
    }

    let roots = fallback_roots(document_path, workspace_root);
    resolve_by_workspace_suffix(&path, &roots)
}

#[tauri::command]
fn write_export_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    fs::write(&path_buf, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_markdown_file(
    path: String,
    contents: String,
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<FilePayload, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !path_buf.is_file() || !is_markdown_file(&path_buf) {
        return Err(format!("Not a Markdown file: {}", path));
    }

    fs::write(&path_buf, contents).map_err(|e| e.to_string())?;
    *state.current_file.lock().unwrap() = Some(path_buf.clone());

    let mut watched = state.watched_files.lock().unwrap();
    if !watched.contains(&path_buf) {
        watched.insert(path_buf.clone());
        start_watcher(app, path_buf.clone());
    }

    read_md_file(&path_buf)
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path not found: {}", path));
    }

    let status = Command::new("open")
        .arg("-R")
        .arg(&path_buf)
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to reveal in Finder: {}", path))
    }
}

fn open_file_in_window(app: &tauri::AppHandle, path: PathBuf) {
    if let Ok(payload) = read_md_file(&path) {
        if let Some(state) = app.try_state::<AppState>() {
            *state.current_file.lock().unwrap() = Some(path.clone());
            let mut watched = state.watched_files.lock().unwrap();
            if !watched.contains(&path) {
                watched.insert(path.clone());
                start_watcher(app.clone(), path.clone());
            }
        }
        let _ = app.emit("load-file", payload);
    }
}

fn start_watcher(app: tauri::AppHandle, path: PathBuf) {
    std::thread::spawn(move || {
        use std::time::{Duration, SystemTime};

        let mut last_modified = fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);

        loop {
            std::thread::sleep(Duration::from_secs(1));

            let current = match fs::metadata(&path).and_then(|m| m.modified()) {
                Ok(t) => t,
                Err(_) => continue,
            };

            if current != last_modified {
                last_modified = current;
                if let Ok(payload) = read_md_file(&path) {
                    let _ = app.emit("file-changed", payload);
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            current_file: Mutex::new(None),
            watched_files: Mutex::new(HashSet::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            open_file,
            list_markdown_files,
            resolve_image_path,
            write_export_file,
            save_markdown_file,
            reveal_in_finder
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = PathBuf::from(&args[1]);
                if file_path.exists()
                    && file_path
                        .extension()
                        .map_or(false, |ext| ext.eq_ignore_ascii_case("md"))
                {
                    let handle = app.handle().clone();
                    let path = file_path.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        open_file_in_window(&handle, path);
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MD Viewer");
}
