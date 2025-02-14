<template>
  <div class="toolbar-theme-switch">
    <toolbar-base :content="baseContent" :icon="baseIcon" :options="optionsData" @click-api="toChangeTheme">
      <template v-if="position === 'collapse'">
        <div class="toolbar-theme-switch-radio">
          <div class="toolbar-theme-switch-radio-title">主题</div>
          <tiny-radio-group v-model="state.theme" :options="THEME_DATA" class="theme-radio-group" @change="themeChange">
          </tiny-radio-group>
        </div>
      </template>
    </toolbar-base>
  </div>
</template>

<script>
import { computed } from 'vue'
import { ToolbarBase } from '@opentiny/tiny-engine-common'
import { RadioGroup } from '@opentiny/vue'
import useThemeSwitch from './composable/useThemeSwitch.js'

export default {
  components: {
    ToolbarBase,
    TinyRadioGroup: RadioGroup
  },
  props: {
    options: {
      type: Object,
      default: () => ({})
    },
    position: {
      type: String,
      default: 'right'
    }
  },
  setup(props) {
    const COLLAPSE = 'collapse'
    const { themeState: state, THEME_DATA, themeChange, getTheme, initThemeState } = useThemeSwitch()
    initThemeState()
    const optionsData = computed(() => {
      const options = { ...props.options }
      if (props.position === COLLAPSE) {
        options.renderType = ''
      }

      return options
    })
    const baseContent = computed(() => (props.position === COLLAPSE ? '' : state.themeLabel))
    const baseIcon = computed(() => (props.position === COLLAPSE ? '' : state.theme))

    const toChangeTheme = () => {
      if (props.position === COLLAPSE) {
        return
      }

      const theme = getTheme(state.theme).oppositeTheme
      themeChange(theme)
    }

    return {
      THEME_DATA,
      state,
      optionsData,
      baseContent,
      baseIcon,
      toChangeTheme,
      themeChange
    }
  }
}
</script>
