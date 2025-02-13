<template>
  <div class="toolbar-theme-switch">
    <toolbar-base
      :content="baseContent"
      :icon="baseIcon"
      :options="optionsData"
      :position="position"
      @click-api="themeChange"
    >
      <template v-if="position === 'collapse'">
        <div class="toolbar-theme-switch-radio">
          <div class="toolbar-theme-switch-radio-title">主题</div>
          <tiny-radio-group v-model="state.theme" :options="THEME_DATA" class="theme-radio-group" @change="radioChange">
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
    const THEME_DATA = useThemeSwitch().THEME_DATA
    const COLLAPSE = 'collapse'
    const state = useThemeSwitch().initThemeState()
    const optionsData = computed(() => {
      const options = { ...props.options }
      if (props.position === COLLAPSE) {
        options.renderType = ''
      }

      return options
    })
    const baseContent = computed(() => (props.position === COLLAPSE ? '' : state.themeLabel))
    const baseIcon = computed(() => (props.position === COLLAPSE ? '' : state.theme))

    const themeChange = () => {
      if (props.position === COLLAPSE) {
        return
      }

      useThemeSwitch().themeChange()
    }

    const radioChange = useThemeSwitch().themeChange

    return {
      THEME_DATA,
      state,
      optionsData,
      baseContent,
      baseIcon,
      themeChange,
      radioChange
    }
  }
}
</script>
<style lang="less" scoped>
.toolbar-theme-switch-radio {
  height: 44px;
  .toolbar-theme-switch-radio-title {
    color: var(--te-toolbar-theme-switch-radio-title);
  }
}
</style>
