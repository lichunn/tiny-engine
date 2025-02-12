import { HOOK_NAME } from '@opentiny/tiny-engine-meta-register'
import useThemeSwitch from './useThemeSwitch'

export const ThemeSwitchService = {
  id: 'engine.service.themeSwitch',
  type: 'MetaService',
  apis: useThemeSwitch(),
  composable: {
    name: HOOK_NAME.useThemeSwitch
  }
}
