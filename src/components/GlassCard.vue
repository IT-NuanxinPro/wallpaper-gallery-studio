<template>
  <div class="glass-card" :class="{ 'glass-card--hoverable': hoverable }" :style="cardStyle">
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  hoverable: {
    type: Boolean,
    default: true
  },
  padding: {
    type: String,
    default: '24px'
  },
  blur: {
    type: String,
    default: '20px'
  }
})

const cardStyle = computed(() => ({
  padding: props.padding,
  '--glass-blur': props.blur
}))
</script>

<style scoped lang="scss">
.glass-card {
  position: relative;
  background: var(--studio-surface, #191b1e);
  border: 1px solid var(--studio-border-subtle, #282b30);
  border-radius: 20px;
  box-shadow: none;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
  &--hoverable:hover {
    border-color: var(--studio-border, #30343b);
    background: var(--studio-raised, #22252a);
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
