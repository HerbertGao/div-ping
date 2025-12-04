# Div Ping

![CI](https://github.com/HerbertGao/div-ping/workflows/CI/badge.svg)

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

### 注意事项

- ⚠️ JSON模板中变量**不要**加引号：`{"msg": {{content}}}` ✓  `{"msg": "{{content}}"}`  ✗
- ⚠️ 最小监控间隔：60秒（Chrome Alarms API限制）
- ✅ 内置安全防护：SSRF保护、重定向拦截、header注入防护

## 常见问题

**保存项目失败?** 在 `chrome://extensions/` 重新加载扩展

**监控不工作?** 检查刷新间隔和CSS选择器是否正确

**调试方法:** `chrome://extensions/` → Service Worker 查看日志

## 开发待办

### 中优先级

- [ ] 改为动态权限请求 - 当前`<all_urls>`权限过大
- [ ] 程序化注入content script - 避免在所有页面加载脚本
- [ ] 添加Webhook速率限制 - 防止频繁触发
- [ ] 实现输入验证 - 项目名称、选择器、间隔等
- [ ] 添加错误重试机制 - 网络失败时自动重试
- [ ] 优化waitForTabLoad实现 - 改为async/await模式避免递归回调

### 低优先级

- [ ] 添加单元测试 - 特别是SSRF验证、变量替换等关键逻辑
- [ ] 添加JSDoc文档注释 - 为公共API提供文档
- [ ] 支持国际化(i18n) - 提高国际协作潜力
- [ ] 添加内容长度限制 - 防止存储耗尽

## 许可证

MIT License
