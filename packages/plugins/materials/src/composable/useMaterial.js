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
import { utils, constants } from '@opentiny/tiny-engine-utils'
import { meta as BuiltinComponentMaterials } from '@opentiny/tiny-engine-builtin-component'
import {
  getMergeMeta,
  getOptions,
  useNotify,
  useCanvas,
  useBlock,
  getMetaApi,
  META_SERVICE
} from '@opentiny/tiny-engine-meta-register'
import meta from '../../meta'

const { camelize, capitalize } = utils
const { MATERIAL_TYPE } = constants

// 这里存放所有TinyVue组件、原生HTML、内置组件的缓存，包含了物料插件面板里所有显示的组件，也包含了没显示的一些联动组件
const resource = new Map()

// 这里涉及到区块发布后的更新问题，所以需要单独缓存区块
const blockResource = new Map()

const materialState = reactive({
  components: [], // 这里存放的是物料插件面板里所有显示的组件
  blocks: [],
  thirdPartyDeps: { scripts: [], styles: new Set() }
})

const componentState = reactive({
  componentsMap: {}
})
const getSnippet = (component) => {
  let schema = {}
  materialState.components.some(({ children }) => {
    const child = children.find(({ snippetName }) => snippetName === component)
    if (child) {
      schema = child.schema
      return true
    }
    return false
  })

  return schema
}

const generateNode = ({ type, component }) => {
  const snippet = getSnippet(component) || {}

  const schema = {
    componentName: component,
    ...snippet,
    props: {
      ...snippet.props,
      className: getOptions(meta.id).useBaseStyle ? getOptions(meta.id).componentBaseStyle.className : ''
    }
  }

  if (type === 'block') {
    schema.componentType = 'Block'
    schema.props.className = getOptions(meta.id).useBaseStyle ? getOptions(meta.id).blockBaseStyle.className : ''
  }

  return schema
}

/**
 * 获取物料组件的配置信息
 * @returns
 */
const getConfigureMap = () => {
  const entries = Object.entries(Object.fromEntries(resource)).map(([key, value]) => {
    return [key, value.content?.configure || value.configure]
  })
  return Object.fromEntries(entries)
}

/**
 * 附加基础属性，基础属性可以通过注册表配置
 * @param {any[]} schemaProperties
 * @returns
 */
const patchBaseProps = (schemaProperties) => {
  if (!Array.isArray(schemaProperties)) {
    return
  }

  const { properties = [], insertPosition = 'end' } = getOptions(meta.id).basePropertyOptions || {}

  for (const basePropGroup of properties) {
    const group = schemaProperties.find((item) => {
      // 如果存在了包含'其他'字符串的分组，统一为'其他'分组
      if (item.label.zh_CN.includes('其他')) {
        item.label.zh_CN = '其他'
      }

      return (
        (basePropGroup.group && basePropGroup.group === item.group) || basePropGroup.label.zh_CN === item.label.zh_CN
      )
    })

    if (group) {
      if (insertPosition === 'start') {
        group.content.splice(0, 0, ...basePropGroup.content)
      } else {
        group.content.push(...basePropGroup.content)
      }
    } else {
      schemaProperties.push(basePropGroup)
    }
  }
}

/**
 * 将component里的内容注册到resource变量中
 * @param {*} data
 */
const registerComponentToResource = (data) => {
  patchBaseProps(data.schema?.properties)

  if (Array.isArray(data.component)) {
    const { component, ...others } = data
    component.forEach((item) => {
      resource.set(item, { item, ...others, type: MATERIAL_TYPE.Component })
    })
  } else {
    resource.set(data.component, { ...data, type: MATERIAL_TYPE.Component })
  }
}

const fetchBlockDetail = async (blockName) => {
  const { getBlockAssetsByVersion } = useBlock()
  const currentVersion = componentState.componentsMap?.[blockName]?.version
  const block = (await getMetaApi(META_SERVICE.Http).get(`/material-center/api/block?label=${blockName}`))?.[0]

  if (!block) {
    throw new Error(`区块${blockName}不存在！`)
  }

  block.assets = getBlockAssetsByVersion(block, currentVersion)
  block.assets = history?.assets || block.assets

  return block
}

/**
 * registerBlock 注册区块
 * @param {String|Object} data 当为字符串时请求详细信息
 * @param {*} notFetchResouce 是否添加js css资源到页面
 * @returns
 */
const registerBlock = async (data, notFetchResouce) => {
  let block = data

  if (typeof block === 'string') {
    try {
      block = await fetchBlockDetail(block)
    } catch (error) {
      useNotify({
        type: 'warning',
        title: '区块读取错误',
        message: error?.message || error
      })

      return false
    }
  }

  if (!block) {
    return false
  }

  block.type = MATERIAL_TYPE.Block
  block.component = block.component || block.blockName || block.label || block.fileName
  // 区块还原备份时, 后台改变current_history, 所以assets优先从current_history里取
  const assets = block.assets
  const label = block.component
  const { scripts = [], styles = [] } = assets || {}

  if (!notFetchResouce && !blockResource.get(label)) {
    const { addScript, addStyle } = useCanvas().canvasApi.value
    const promises = scripts
      .filter((item) => item.includes('umd.js'))
      .map(addScript)
      .concat(styles.map(addStyle))
    // 此处删除await，提前放行区块数据，在区块渲染前找到区块数据源映射关系
    Promise.allSettled(promises)
    blockResource.set(label, block.content)
  }
  return block
}

const clearMaterials = () => {
  materialState.components = []
  materialState.blocks = []
  resource.clear()
}

const clearBlockResources = () => blockResource.clear()

/**
 * 收集第三方组件库依赖
 * @param {array} components 组件物料列表
 */
const generateThirdPartyDeps = (components) => {
  const styles = []
  const scripts = []

  components.forEach((item) => {
    const { npm, component } = item

    if (!npm || !Object.keys(npm).length) return

    const { package: pkg, script, exportName, css } = npm
    const currentPkg = scripts.find((item) => item.package === pkg)

    if (currentPkg) {
      // 保存组件id和导出组件名的对应关系 TinyButton： Button
      currentPkg.components[component] = exportName
    } else {
      scripts.push({
        package: pkg,
        script,
        components: {
          [component]: exportName
        }
      })
    }

    if (css) {
      styles.push(css)
    }
  })

  return { styles, scripts }
}

/**
 * 设置第三方组件库依赖
 * @param {array} components 组件物料列表
 */
const setThirdPartyDeps = (components) => {
  const { scripts = [], styles = [] } = generateThirdPartyDeps(components)
  materialState.thirdPartyDeps.scripts.push(...scripts)
  styles.forEach((item) => materialState.thirdPartyDeps.styles.add(item))
}

/**
 * 添加组件snippets(分组相同则合并)
 * @param {*} componentsSnippets 待添加的组件snippets
 * @param {*} snippetsData 当前snippets
 * @returns {*} snippetsData 合并后的snippets
 */
const addComponentSnippets = (componentSnippets, snippetsData) => {
  if (!componentSnippets) return

  const snippetsMap = new Map()
  snippetsData.forEach((snippetGroup) => snippetsMap.set(snippetGroup.group, snippetGroup))
  componentSnippets.forEach((snippetGroup) => {
    if (snippetsMap.has(snippetGroup.group)) {
      snippetsMap.get(snippetGroup.group).children.push(...snippetGroup.children)
    } else {
      snippetsData.push(snippetGroup)
    }
  })

  return snippetsData
}

/**
 * 添加物料Bundle文件中的组件类型物料
 * @param {*} materialBundle 物料包Bundle.json文件对象
 * @returns null
 */
const addComponents = (materialBundle) => {
  const { snippets, components } = materialBundle
  // 解析组件三方依赖
  setThirdPartyDeps(components)
  // 注册组件到map中
  components.forEach(registerComponentToResource)
  // 添加组件snippets
  addComponentSnippets(snippets, materialState.components)
}

/**
 * 添加物料Bundle文件中的区块类型物料
 * @param {*} blocks 物料包Bundle.json文件中blocks对象
 */
const addBlocks = (blocks) => {
  if (!Array.isArray(blocks) || !blocks.length) {
    return
  }
  const promises = blocks?.map((item) => registerBlock(item, true))

  Promise.allSettled(promises).then((blocks) => {
    if (!blocks?.length) {
      return
    }
    // 默认区块都会展示在默认分组中
    if (!materialState.blocks?.[0]?.children) {
      materialState.blocks.push({
        groupId: useBlock().DEFAULT_GROUP_ID,
        groupName: useBlock().DEFAULT_GROUP_NAME,
        children: []
      })
    }
    materialState.blocks[0].children.unshift(
      ...blocks.filter((res) => res.status === 'fulfilled').map((res) => res.value)
    )
  })
}

/**
 * 获取到符合物料协议的bundle.json之后，处理组件与区块物料
 * @param {*} materials
 */
const addMaterials = (materials = {}) => {
  addComponents(materials)
  addBlocks(materials.blocks)
}

const getMaterial = (name) => {
  if (name) {
    // 先读取组件缓存，再读取区块缓存
    return (
      resource.get(name) ||
      resource.get(capitalize(camelize(name))) ||
      blockResource.get(name) ||
      blockResource.get(capitalize(camelize(name))) ||
      {}
    )
  } else {
    return {}
  }
}

const setMaterial = (name, data) => {
  resource.set(name, data)
}

/**
 * 获取物料，并返回符合物料协议的bundle.json内容
 * @returns getMaterialsRes: () =>  Promise<Materials>
 */
export const getMaterialsRes = async () => {
  const bundleUrls = getMergeMeta('engine.config')?.material || []
  const materials = await Promise.allSettled(bundleUrls.map((url) => getMetaApi(META_SERVICE.Http).get(url)))
  return materials
}

const fetchMaterial = async () => {
  const materials = await getMaterialsRes()

  materials.forEach((response) => {
    if (response.status === 'fulfilled' && response.value.materials) {
      addMaterials(response.value.materials)
    }
  })
}

/**
 * 获取区块保存的依赖信息，合并到resState.thirdPartyDeps
 * @param {object} dependencies 区块保存的依赖信息
 */
const getBlockDeps = (dependencies = {}) => {
  const { scripts = [], styles = [] } = dependencies

  scripts.length &&
    scripts.forEach((npm) => {
      const { package: pkg, script, css, components } = npm
      const npmInfo = materialState.thirdPartyDeps.scripts.find((item) => item.package === pkg)

      if (!npmInfo || !npmInfo.script) {
        materialState.thirdPartyDeps.scripts.push({ package: pkg, script, css, components })
      } else {
        const components = npmInfo.components || {}

        npmInfo.components = { ...components, ...npm.components }
      }
    })

  styles?.forEach((item) => materialState.thirdPartyDeps.styles.add(item))
}

/**
 * 获取新增区块的依赖，更新画布中的组件依赖
 * @param {array} blocks 新增的区块列表
 */
const updateCanvasDependencies = (blocks) => {
  blocks.forEach((block) => {
    if (!block.content.dependencies) return

    getBlockDeps(block.content.dependencies)
  })

  useCanvas().canvasApi.value?.canvasDispatch('updateDependencies', { detail: materialState.thirdPartyDeps })
}

const initBuiltinMaterial = () => {
  const { Builtin } = useCanvas().canvasApi.value
  // 添加画布物料
  addMaterials(Builtin.data.materials)
  // 添加builtin-component NPM包物料
  addMaterials(BuiltinComponentMaterials)
}

const initMaterial = ({ isInit = true, appData = {} } = {}) => {
  initBuiltinMaterial()
  if (isInit) {
    componentState.componentsMap = {}
    appData.componentsMap?.forEach((component) => {
      if (component.dependencies) {
        getBlockDeps(component.dependencies)
      }
      componentState.componentsMap[component.componentName] = component
    })
  }
}

export default function () {
  return {
    materialState, // 存放着组件、物料侧区块、第三方依赖信息
    initMaterial, // 物料模块初始化
    fetchMaterial, // 请求物料并进行处理
    getMaterialsRes, // 获取物料，并返回符合物料协议的bundle.json内容，getMaterialsRes: () =>  Promise<Materials>
    generateNode, // 根据 包含{ type, componentName }的组件信息生成组件schema节点，结构：
    clearMaterials, // 清空物料
    clearBlockResources, // 清空区块缓存，以便更新最新版区块
    getMaterial, // 获取单个物料，(property) getMaterial: (name: string) => Material
    setMaterial, // 设置单个物料 (property) setMaterial: (name: string, data: Material) => void
    addMaterials, // 添加多个物料
    registerBlock, // 注册新的区块
    updateCanvasDependencies, //传入新的区块，获取新增区块的依赖，更新画布中的组件依赖
    getConfigureMap // 获取物料组件的配置信息
  }
}
