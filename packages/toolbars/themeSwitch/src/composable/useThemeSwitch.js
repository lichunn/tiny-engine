/**
 * Copyright (c) 2023 - present TinyEngine Authors.
 * Copyright (c) 2023 - present Huawei Cloud Computing Technologies Co., Ltd.
 *
 * Use of this source code is governed by an MIT-style license.
 *
 * THE OPEN SOURCE SOFTWARE IN THIS PRODUCT IS DISTRIBUTED IN THE HOPE THAT IT WILL BE USEFUL,
 * BUT WITHOUT ANY WARRANTY, WITHOUT EVEN THE IMPLIED WARRANTY OF MERCHANTABILITY OR FITNESS FOR
 * A PARTICULAR PURPOSE. SEE THE APPLICABLE LICENSES FOR MORE DETAILS.
 *
 */

import { reactive } from 'vue'
import { getMetaApi, getMergeMeta, META_SERVICE } from '@opentiny/tiny-engine-meta-register'
import { setGlobalMonacoEditorTheme } from '@opentiny/tiny-engine-common'

const THEME_DATA = [
  {
    text: '浅色模式',
    label: 'light',
    oppositeTheme: 'dark'
  },
  {
    text: '深色模式',
    label: 'dark',
    oppositeTheme: 'light'
  }
]

const DEFAULT_THEME = THEME_DATA[0]

const themeState = reactive({
  theme: DEFAULT_THEME.label,
  themeLabel: DEFAULT_THEME.text
})

const getTheme = (theme) => {
  return THEME_DATA.find((item) => theme === item.label) || DEFAULT_THEME
}

const themeChange = (theme) => {
  themeState.theme = getTheme(theme).label
  themeState.themeLabel = getTheme(themeState.theme).text
  document.documentElement.setAttribute('data-theme', themeState.theme)

  const appId = getMetaApi(META_SERVICE.GlobalService).getBaseInfo().id
  const editorTheme = themeState.theme?.includes('dark') ? 'vs-dark' : 'vs'
  localStorage.setItem(`tiny-engine-theme-${appId}`, themeState.theme)
  setGlobalMonacoEditorTheme(editorTheme)
}

const initThemeState = () => {
  const appId = getMetaApi(META_SERVICE.GlobalService).getBaseInfo().id
  const theme =
    localStorage.getItem(`tiny-engine-theme-${appId}`) || getMergeMeta('engine.config').theme || DEFAULT_THEME.label

  themeChange(theme)
}

export default () => {
  return {
    THEME_DATA,
    themeState,
    getTheme,
    initThemeState,
    themeChange
  }
}
