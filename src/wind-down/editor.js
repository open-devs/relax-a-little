const { workspace, extensions, window } = require('vscode')
const { readFileSync } = require('fs')
const path = require('path')
const chroma = require('chroma-js')
const json5 = require('json5')
// const { getConfig } = require('../utils/index')

/**
 * Load the current theme's configuration files.
 * @param {String} themeName Theme to search for
 * @returns colors and tokenRules
 */
const getThemeColors = (themeName) => {
  // workaround for https://github.com/Microsoft/vscode/issues/32813
  let currentThemePath = null
  for (const extension of extensions.all) {
    if (extension.packageJSON.contributes && extension.packageJSON.contributes.themes) {
      const themes = extension.packageJSON.contributes.themes
      const currentTheme = themes.find(theme => theme.id === themeName || theme.label === themeName)
      if (currentTheme !== undefined) {
        currentThemePath = path.join(extension.extensionPath, currentTheme.path)
        break
      }
    }
  }

  const themePaths = []
  if (currentThemePath !== null) {
    themePaths.push(currentThemePath)
  }

  let colors = {}
  colors['statusBar.background'] = '#007ACC' // missing default
  let tokenRules = []
  while (themePaths.length > 0) {
    const themePath = themePaths.pop()
    const theme = json5.parse(readFileSync(themePath).toString())
    if ('include' in theme) {
      themePaths.push(path.join(path.dirname(themePath), theme.include))
    }
    if ('colors' in theme) {
      colors = { ...colors, ...theme.colors }
    }
    if ('tokenColors' in theme) {
      tokenRules = [...tokenRules, ...theme.tokenColors]
    }
  }

  return {
    colors,
    tokenRules,
  }
}

/**
 * Update the workspace configuration file.
 * @param {Object} settings key-values to write into the configuration
 */
const applySettings = (settings) => {
  if (!settings) {
    return // no settings, nothing to do
  }
  const workspaceSettings = workspace.getConfiguration()
  Object.keys(settings).forEach((k) => {
    workspaceSettings.update(k, settings[k], true).then(undefined, (reason) => {
      console.error(reason)
      window.showErrorMessage(
        `You tried to apply \`${ k }: ${ settings[k] }\` but this is not a valid VS Code settings
          key/value pair.`
      )
    })
  })
}

/**
 * Set the saturation of theme and token colors.
 * @param {Number} fraction 0.0 (gray) to 1.0 (no change).
 */
exports.setSaturation = (fraction) => {
  fraction = Math.min(1, Math.max(0, fraction))

  const workbench = workspace.getConfiguration('workbench')
  const colors = getThemeColors(workbench.colorTheme)

  const desaturate = (color) => chroma.hex(color).desaturate((1 - fraction) * 5).hex()

  const newColors = {}
  Object.entries(colors.colors)
    .forEach(([key, color]) => newColors[key] = desaturate(color))

  const newTokenRules = []
  colors.tokenRules.forEach(rule => {
    const newSettings = {}
    Object.entries(rule.settings)
      .forEach(([key, value]) => newSettings[key] = (value).startsWith('#') ? desaturate(value) : value)
    newTokenRules.push({
      ...rule,
      settings: newSettings,
    })
  })

  applySettings({
    'workbench.colorCustomizations': newColors,
    'editor.tokenColorCustomizations': {
      'textMateRules': newTokenRules,
    },
  })
}

/**
 * Clear all customizations.
 */
exports.reset = () => {
  const workspaceSettings = workspace.getConfiguration()
  Object.keys(workspaceSettings.get('workbench.colorCustomizations') || {}).forEach(key => {
    workspaceSettings.update(key, undefined, true)
      .then(undefined, (reason) => console.error(reason))
  })
  workspaceSettings.update('editor.tokenColorCustomizations', undefined, true)
    .then(undefined, (reason) => console.error(reason))
  workspaceSettings.update('workbench.colorCustomizations', undefined, true)
    .then(undefined, (reason) => console.error(reason))
}
