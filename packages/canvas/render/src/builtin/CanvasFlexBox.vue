<template>
  <component
    :is="tag"
    v-bind="$attrs"
    :style="{
      display: 'flex',
      flexDirection,
      gap: gap ? gap + 'px' : '0px',
      padding: padding ? padding + 'px' : '0px'
    }"
    class="canvas-flex-box"
  >
    <slot>
      <canvas-placeholder :placeholder="$attrs.placeholder"></canvas-placeholder>
    </slot>
  </component>
</template>

<script>
import { reactive } from 'vue'
import CanvasPlaceholder from './CanvasPlaceholder.vue'
export default {
  components: {
    CanvasPlaceholder
  },
  props: {
    tag: {
      type: String,
      default: 'div'
    },
    flexDirection: {
      type: String,
      default: 'row'
    },
    gap: {
      type: Number,
      default: 8
    },
    padding: {
      type: Number,
      default: 8
    }
  },
  setup(props) {
    const state = reactive({
      flexDirection: props.flexDirection,
      gap: props.gap ? props.gap + 'px' : '0px',
      padding: props.padding ? props.padding + 'px' : '0px'
    })

    return {
      state
    }
  }
}
</script>
<style scoped>
.canvas-flex-box {
  display: flex;
  flex-direction: v-bind('state.flexDirection');
  gap: v-bind('state.gap');
  padding: v-bind('state.padding');
}
</style>
