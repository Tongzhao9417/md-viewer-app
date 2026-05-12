# Markdown Viewer 示例文档

这份文档用来测试常见的 Markdown 渲染效果：标题、强调、列表、表格、代码块、引用、任务列表和分隔线。

## 文本排版

Markdown 适合写结构清晰的内容。你可以使用 **加粗**、*斜体*、`行内代码`，也可以插入链接，例如 [Markdown Guide](https://www.markdownguide.org/)。

> 好的 Markdown 文档不需要复杂排版，也能保持清晰的层次和阅读节奏。

## 清单与任务

### 普通列表

- 支持无序列表
- 支持多级内容
  - 子项目可以用于补充说明
  - 适合整理笔记和方案
- 支持 `inline code` 强调关键字段

### 待办事项

- [x] 读取本地 Markdown 文件
- [x] 渲染代码高亮
- [ ] 导出为其他格式
- [ ] 支持更多主题

## 表格

| 功能 | 用途 | 状态 |
| --- | --- | --- |
| 标题层级 | 展示文档结构 | 已支持 |
| 代码块 | 阅读技术内容 | 已支持 |
| 表格 | 对比信息 | 已支持 |
| 任务列表 | 跟踪进度 | 待确认 |

## 代码块

```js
const markdown = "# Hello Markdown";

function preview(source) {
  return renderMarkdown(source, {
    highlight: true,
    breaks: false,
  });
}

console.log(preview(markdown));
```

```rust
fn main() {
    let title = "Markdown Viewer";
    println!("Previewing {}", title);
}
```

## 分隔线与总结

---

Markdown 的优势在于：源码简洁，阅读友好，渲染后也有清楚的视觉层次。这个示例文件可以作为应用首页、测试文件或截图素材使用。
