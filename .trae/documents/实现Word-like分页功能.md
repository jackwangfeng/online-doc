## 功能描述
实现分页预览模式，点击工具栏按钮切换预览/编辑视图。

## 实现方案

### 1. 状态管理
- 添加 `isPrintPreview` 状态控制预览模式
- 预览模式：显示 A4 页面容器 + 分页线
- 编辑模式：正常编辑视图

### 2. 页面容器
- A4 尺寸：210mm × 297mm
- 页边距：上下左右各 20mm
- 白色背景 + 阴影，模拟真实纸张

### 3. 分页线
- 仅在预览模式显示
- 虚线样式
- 显示 "Page X" 页码

### 4. 工具栏按钮
- 图标：Printer 或 FileText
- 点击切换预览/编辑模式
- 按钮有激活状态显示

### 5. CSS 实现
```css
/* 预览模式容器 */
.print-preview .editor-content {
  background: #f0f0f0;
  padding: 20px;
}

/* A4 页面 */
.print-preview .page {
  width: 210mm;
  min-height: 297mm;
  background: white;
  margin: 0 auto 20px;
  padding: 20mm;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* 分页线 */
.page-break {
  border-top: 1px dashed #ccc;
  margin: 20px 0;
  text-align: center;
  color: #999;
}
```

### 6. 文件修改
1. `Editor.tsx` - 添加预览状态、A4 页面容器、分页按钮
2. `Editor.css` - 添加预览模式样式

### 预期效果
- 编辑模式：正常连续编辑
- 预览模式：A4 纸张效果，显示分页边界
- 切换流畅，内容保持不变