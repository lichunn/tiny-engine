<template>
  <div class="toolbar-theme">
    <toolbar-base
      :content="state.themeLabel"
      :icon="state.theme"
      :options="options"
      :position="position"
      @click-api="themeChange"
    >
      <template #radio v-if="position === 'collapse'">
        <div class="toolbar-theme-radio">
          <div class="toolbar-theme-radio-title">主题</div>
          <tiny-radio-group
            v-model="state.themeLabel"
            :options="state.themeOptions"
            class="theme-radio-group"
            @change="themeChange"
          >
          </tiny-radio-group>
        </div>
      </template>
    </toolbar-base>
  </div>
</template>

<script lang="jsx">
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
    const state = useTheme().themeState

    const themeChange = useTheme().themeChange

    return {
      state,
      themeChange
    }
  }
}
</script>
<style scoped>
.toolbar-theme-radio {
  height: 44px;
  .toolbar-theme-radio-title {
    color: var(--te-toolbar-theme-radio-title);
  }
}
</style>
