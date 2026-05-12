use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
struct FilePayload {
    path: String,
    content: String,
}

struct AppState {
    current_file: Mutex<Option<PathBuf>>,
    watched_files: Mutex<HashSet<PathBuf>>,
}

fn read_md_file(path: &PathBuf) -> Result<FilePayload, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(FilePayload {
        path: path.to_string_lossy().to_string(),
        content,
    })
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

#[tauri::command]
fn write_export_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    fs::write(&path_buf, contents).map_err(|e| e.to_string())
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
        .manage(AppState {
            current_file: Mutex::new(None),
            watched_files: Mutex::new(HashSet::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            open_file,
            write_export_file
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
