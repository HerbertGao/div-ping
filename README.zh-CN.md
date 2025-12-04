# div-ping

![CI](https://github.com/HerbertGao/div-ping/workflows/CI/badge.svg)

监控网页中指定DOM元素的变化，支持浏览器通知和Webhook通知。

## 功能特性

- 可视化元素选择（悬停高亮）
- 多项目管理
- 后台定时监控
- 浏览器通知 + Webhook通知
- 完整的日志系统
- 数据导入/导出

## 安装方法

1. 打开Chrome浏览器，访问 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `div-ping` 文件夹

## 使用方法

1. 打开需要监控的网页
2. 点击扩展图标
3. 点击"选择元素"
4. 选择要监控的元素
5. 配置监控参数并保存

## Webhook配置

支持的变量：`{{projectName}}`、`{{url}}`、`{{selector}}`、`{{oldContent}}`、`{{newContent}}`、`{{timestamp}}`

### 示例

**GET请求：**

```text
https://api.example.com/notify?name={{projectName}}&content={{newContent}}
```

**POST请求：**

```json
{
  "text": "{{projectName}} 检测到变化：{{newContent}}"
}
```

### 重要提示

- ⚠️ JSON模板中的变量**不应**加引号：`{"msg": {{content}}}` ✓  `{"msg": "{{content}}"}`  ✗
- ⚠️ 最小监控间隔：60秒（Chrome Alarms API限制）
- ✅ 内置安全防护：SSRF防护、重定向拦截、Header注入防护

## 常见问题

**项目保存失败？** 在 `chrome://extensions/` 重新加载扩展

**监控不工作？** 检查刷新间隔和CSS选择器是否有效

**调试方法：** `chrome://extensions/` → Service Worker查看日志

## 测试

```bash
npm test                 # 运行测试
npm run test:coverage    # 生成覆盖率报告
```

全部74个测试通过，覆盖SSRF验证、变量替换、存储操作和i18n等关键功能。

## 许可证

MIT License
