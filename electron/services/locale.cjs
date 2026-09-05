const CATALOGS = {
  'en-US': {
    'tray.show': 'Show Orbit Desktop',
    'tray.hide': 'Hide',
    'tray.quit': 'Quit',
    'manual.chooseTitle': 'Choose an application',
    'manual.windowsApplications': 'Windows applications',
    'launch.unverified': 'Could not verify the launch entry for {{name}}.',
    'launch.failed': 'Could not launch {{name}}.',
    'launch.starting': 'Launching {{name}}',
    'launch.invalidRequest': 'The launch request is invalid.',
    'launch.notInLibrary': 'This application has not been added to Orbit Desktop.',
  },
  'zh-CN': {
    'tray.show': '显示 Orbit Desktop',
    'tray.hide': '隐藏',
    'tray.quit': '退出',
    'manual.chooseTitle': '选择要添加的应用',
    'manual.windowsApplications': 'Windows 应用',
    'launch.unverified': '无法验证 {{name}} 的启动入口。',
    'launch.failed': '无法启动 {{name}}。',
    'launch.starting': '正在启动 {{name}}',
    'launch.invalidRequest': '启动请求无效。',
    'launch.notInLibrary': '该应用尚未添加到 Orbit Desktop。',
  },
}

function mainText(language, key, parameters = {}) {
  const catalog = CATALOGS[language] || CATALOGS['en-US']
  const template = catalog[key] || CATALOGS['en-US'][key] || key
  return template.replace(/{{\s*([^{}\s]+)\s*}}/g, (placeholder, name) => (
    Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder
  ))
}

module.exports = { mainText }
