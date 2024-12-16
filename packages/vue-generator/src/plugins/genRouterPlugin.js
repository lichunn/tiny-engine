import { mergeOptions } from '../utils/mergeOptions'

const defaultOption = {
  fileName: 'index.js',
  path: './src/router'
}

const transformRoutes = (routes) => {
  const result = []
  const processRoutes = (currentRoutes, basePath = '') => {
    currentRoutes.forEach((route) => {
      const fullPath = basePath
        ? `${basePath}${route.path.startsWith('/') ? route.path : '/' + route.path}`
        : route.path

      if (route.component) {
        // 如果路由有component，直接添加到结果数组中
        result.push({
          path: fullPath,
          component: route.component,
          ...(route.children
            ? {
                children: route.children.map((child) => ({
                  ...child,
                  path: child.path.startsWith('/') ? child.path : `/${child.path}`
                }))
              }
            : {})
        })
      } else if (route.children && route.children.length > 0) {
        // 如果路由没有component但有children
        processRoutes(route.children, fullPath)
      }
    })
  }
  processRoutes(routes)

  return result
}

const convertToNestedRoutes = (schema) => {
  const { pageSchema } = schema
  const result = []

  pageSchema.forEach((item) => {
    const parts = item.meta?.router?.split('/').filter(Boolean)
    let curretnLevel = result

    parts.forEach((part, index) => {
      let found = false

      for (let i = 0; i < curretnLevel.length; i++) {
        if (curretnLevel[i].path === part) {
          // 如果已经存在该路径部分，则进入下一层级
          curretnLevel = curretnLevel[i].children
          found = true
          break
        }
      }
      if (!found) {
        // 如果不存在该路径部分，创建一个新节点
        const newNode = {
          path: part,
          children: []
        }
        // 如果路径是最后一步，则设置组件和属性
        if (index === parts.length - 1) {
          // if(path === '/')
          newNode.component = `() => import('@/views${item.path ? `/${item.path}` : ''}/${item.fileName}.vue')`
        }

        curretnLevel.push(newNode)
        curretnLevel = newNode.children
      }
    })
  })

  return transformRoutes(result)
}

// 示例路由数组

function genRouterPlugin(options = {}) {
  const realOptions = mergeOptions(defaultOption, options)

  const { path, fileName } = realOptions

  return {
    name: 'tinyEngine-generateCode-plugin-router',
    description: 'transform router schema to router code plugin',
    /**
     * 根据页面生成路由配置
     * @param {import('@opentiny/tiny-engine-dsl-vue').IAppSchema} schema
     * @returns
     */
    run(schema) {
      const routesList = convertToNestedRoutes(schema)

      // TODO: 支持 hash 模式、history 模式
      const importSnippet = "import { createRouter, createWebHashHistory } from 'vue-router'"
      const exportSnippet = `
      export default createRouter({
        history: createWebHashHistory(),
        routes
      })`

      const routeSnippets = `const routes = ${JSON.stringify(routesList, null, 2)}`

      const res = {
        fileType: 'js',
        fileName,
        path,
        fileContent: `${importSnippet}\n ${routeSnippets} \n ${exportSnippet}`
      }

      return res
    }
  }
}

export default genRouterPlugin
