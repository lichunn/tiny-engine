import useThemeSwitch from './useThemeSwitch'

export const ThemeSwitchService = {
  id: 'engine.service.themeSwitch',
  type: 'MetaService',
  apis: useThemeSwitch()
}
