# Div Ping

监控网页中指定DOM元素的变化，通过浏览器通知或Webhook发送提醒。

## 功能特点

- 可视化元素选择（鼠标悬停高亮）
- 多项目管理
- 后台定期检测
- 浏览器通知 + Webhook通知
- 完整日志记录
- 数据导入导出

## 安装

1. 打开Chrome浏览器，访问 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `div-ping` 文件夹

## 使用

1. 打开要监控的网页
2. 点击扩展图标
3. 点击"选择元素"
4. 选中要监控的元素
5. 配置监控参数并保存

## Webhook配置

支持的变量: `{{projectName}}`, `{{url}}`, `{{selector}}`, `{{oldContent}}`, `{{newContent}}`, `{{timestamp}}`

### 示例

**GET请求:**

```text
https://api.example.com/notify?name={{projectName}}&content={{newContent}}
```

**POST请求:**

```json
{
  "text": "{{projectName}} 检测到变化: {{newContent}}"
}
```

## 常见问题

**保存项目失败?** 在 `chrome://extensions/` 重新加载扩展

**监控不工作?** 检查刷新间隔和CSS选择器是否正确

**调试方法:** `chrome://extensions/` → Service Worker 查看日志

## 开发待办

### 高优先级

- [ ] 迁移到TypeScript - 增强类型安全和开发体验
- [ ] 将setInterval改为chrome.alarms API - Service Worker可能被终止导致定时器丢失
- [ ] 修复storage竞态条件 - 多个监控同时读写可能导致数据丢失
- [ ] 优化标签页创建策略 - 每次检测都创建新标签页消耗大量资源

### 中优先级

- [ ] 改为动态权限请求 - 当前`<all_urls>`权限过大
- [ ] 程序化注入content script - 避免在所有页面加载脚本
- [ ] 添加Webhook速率限制 - 防止频繁触发
- [ ] 实现输入验证 - 项目名称、选择器、间隔等
- [ ] 添加错误重试机制 - 网络失败时自动重试

### 低优先级

- [ ] 提取魔法数字为常量
- [ ] 添加JSDoc文档注释
- [ ] 支持国际化(i18n)

## 许可证

MIT License
