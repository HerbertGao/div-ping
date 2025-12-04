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

```
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

## 许可证

MIT License
