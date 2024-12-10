import { mergeOptions } from '../utils/mergeOptions'

const defaultOption = {
  fileName: 'index.js',
  path: './src/router'
}

// const parseSchema = (schema) => {
//   const { pageSchema } = schema

//   const routes = pageSchema.map(({ meta: { isHome = false, router = '' } = {}, fileName, path }) => ({
//     filePath: `@/views${path ? `/${path}` : ''}/${fileName}.vue`,
//     fileName,
//     isHome,
//     path: router?.startsWith?.('/') ? router : `/${router}`
//   }))

//   const hasRoot = routes.some(({ path }) => path === '/')

//   if (!hasRoot && routes.length) {
//     const { path: homePath } = routes.find(({ isHome }) => isHome) || { path: routes[0].path }

//     routes.unshift({ path: '/', redirect: homePath })
//   }

//   return routes
// }

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
          component: undefined,
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

  return result
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
      // console.log('routesList',routesList);
      // console.log('parseSchema',parseSchema(schema));

      // TODO: 支持 hash 模式、history 模式
      const importSnippet = "import { createRouter, createWebHashHistory } from 'vue-router'"
      const exportSnippet = `
      export default createRouter({
        history: createWebHashHistory(),
        routes
      })`
      //       const routes = routesList.map(({ fileName, path, redirect, filePath }) => {
      //         let pathAttr = `path: '${path}'`
      //         let redirectAttr = ''
      //         let componentAttr = ''

      //         if (redirect) {
      //           redirectAttr = `redirect: '${redirect}'`
      //         }

      //         if (fileName) {
      //           componentAttr = `component: () => import('${filePath}')`
      //         }

      // const res = [pathAttr, redirectAttr, componentAttr].filter((item) => Boolean(item)).join(',')

      // return `{${res}}`
      //   })

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
