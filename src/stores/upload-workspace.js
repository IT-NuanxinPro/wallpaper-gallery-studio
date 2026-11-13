import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AI_MODEL_KEY } from '@/services/ai/model'

export const useUploadWorkspaceStore = defineStore('upload-workspace', () => {
  const selectedModelKey = ref(AI_MODEL_KEY)
  const series = ref('desktop')
  const categoryL1 = ref('')
  const categoryL2 = ref('')

  const targetPath = computed(() => {
    if (!categoryL1.value) return ''
    const parts = ['wallpaper', series.value, categoryL1.value]
    if (categoryL2.value) {
      parts.push(categoryL2.value)
    }
    return parts.join('/')
  })

  function setTarget(newSeries, l1, l2 = '') {
    series.value = newSeries
    categoryL1.value = l1
    categoryL2.value = l2
  }

  function setSeries(newSeries) {
    series.value = newSeries
  }

  function setAiModel() {
    selectedModelKey.value = AI_MODEL_KEY
  }

  return {
    selectedModelKey,
    series,
    categoryL1,
    categoryL2,
    targetPath,
    setTarget,
    setSeries,
    setAiModel
  }
})
