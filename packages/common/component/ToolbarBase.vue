<template>
  <span class="toolbar-item-wrap" @click="click">
    <component :is="getRender()" v-bind="state">
      <template #default>
        <slot name="button"></slot>
      </template>
    </component>
    <slot></slot>
    <span v-if="isShowContent">{{ state.content }}</span>
  </span>
</template>

<script>
import { reactive, computed } from 'vue'
import ToolbarBaseIcon from './toolbar-built-in/ToolbarBaseIcon.vue'
import ToolbarBaseButton from './toolbar-built-in/ToolbarBaseButton.vue'

export default {
  components: {
    ToolbarBaseIcon,
    ToolbarBaseButton
  },
  props: {
    icon: {
      type: String,
      default: ''
    },
    content: {
      type: String,
      default: ''
    },
    options: {
      type: Object,
      default: () => ({})
    },
    position: {
      type: String,
      default: 'right'
    }
  },
  emits: ['click-api'],
  setup(props, { emit }) {
    const state = reactive({
      icon: computed(() => props.icon),
      content: computed(() => props.content),
      options: computed(() => props.options)
    })

    const click = () => {
      emit('click-api')
    }

    const isShowContent = computed(() => (state.options?.collapsed || props.position === 'collapse') && props.content)

    const getRender = () => {
      if (props.options.renderType === 'button') {
        return ToolbarBaseButton
      }
      if (props.options.renderType === 'icon') {
        return ToolbarBaseIcon
      }
      return false
    }

    return {
      state,
      click,
      getRender,
      isShowContent
    }
  }
}
</script>
<style scoped>
.split-line {
  color: var(--te-common-border-default);
  margin: 0 4px;
  font-size: 14px;
}
.toolbar-item-wrap {
  display: flex;
  align-items: center;
}
.toolbar-item-wrap div {
  display: inline-block;
}
</style>
