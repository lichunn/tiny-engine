<template>
  <div class="canvas-flex-box">
    <slot> </slot>
  </div>
</template>

<script setup>
import { computed, defineProps } from 'vue'
import { getStyleValue } from './helper'

const props = defineProps({
  lexDirection: {
    type: String,
    default: 'row'
  },
  gap: {
    type: [String, Number],
    default: '8px'
  },
  padding: {
    type: [String, Number],
    default: '8px'
  }
})

const styles = computed(() => ({
  flexDirection: props.flexDirection,
  gap: getStyleValue(props.gap),
  padding: getStyleValue(props.padding)
}))
</script>
<style lang="less" scoped>
.canvas-flex-box {
  display: flex;
  flex-direction: v-bind('styles.flexDirection');
  gap: v-bind('styles.gap');
  padding: v-bind('styles.padding');
}
</style>
