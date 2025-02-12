<template>
  <div class="toolbar-theme-switch">
    <toolbar-base
      :content="state.themeLabel"
      :icon="state.theme"
      :options="options"
      :position="position"
      @click-api="themeChange"
    >
      <template #radio v-if="position === 'collapse'">
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
import { ToolbarBase } from '@opentiny/tiny-engine-common'
import { RadioGroup } from '@opentiny/vue'
import useTheme from './composable/useTheme.js'

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
  setup() {
    const THEME_DATA = useTheme().THEME_DATA
    const state = useTheme().initThemeState()

    const themeChange = useTheme().themeChange

    return {
      THEME_DATA,
      state,
      themeChange
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
