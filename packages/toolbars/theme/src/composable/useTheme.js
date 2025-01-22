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
import { getMergeMeta } from '@opentiny/tiny-engine-meta-register'

const THEME_DATA = {
  LIGHT: 'light',
  LIGHT_LABEL: '浅色模式',
  DARK: 'dark',
  DARK_LABEL: '深色模式'
}

const theme = localStorage.getItem('tiny-engine-theme') || getMergeMeta('engine.config').theme || THEME_DATA.LIGHT

const themeState = reactive({
  theme: theme,
  themeLabel: theme === THEME_DATA.LIGHT ? THEME_DATA.LIGHT_LABEL : THEME_DATA.DARK_LABEL,
  themeOptions: [
    {
      label: THEME_DATA.LIGHT_LABEL,
      value: THEME_DATA.LIGHT
    },
    {
      label: THEME_DATA.DARK_LABEL,
      value: THEME_DATA.DARK
    }
  ]
})

const themeChange = (data) => {
  if (data) {
    themeState.theme = data === THEME_DATA.LIGHT_LABEL ? THEME_DATA.LIGHT : THEME_DATA.DARK
  } else {
    themeState.theme = themeState.theme === THEME_DATA.LIGHT ? THEME_DATA.DARK : THEME_DATA.LIGHT
  }

  themeState.themeLabel = themeState.theme === THEME_DATA.LIGHT ? THEME_DATA.LIGHT_LABEL : THEME_DATA.DARK_LABEL
  document.documentElement.setAttribute('data-theme', themeState.theme)
  localStorage.setItem('tiny-engine-theme', themeState.theme)
}

export default () => {
  return {
    THEME_DATA,
    themeState,
    themeChange
  }
}
