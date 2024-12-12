import CanvasCol from './CanvasCol.json'
import CanvasRow from './CanvasRow.json'
import CanvasRowColContainer from './CanvasRowColContainer.json'
import CanvasFlexBox from './CanvasFlexBox.json'

export default {
  components: [CanvasCol.component, CanvasRow.component, CanvasRowColContainer.component, CanvasFlexBox.component],
  snippets: [
    {
      group: 'layout',
      label: {
        zh_CN: '布局与容器'
      },
      children: [CanvasRowColContainer.snippet, CanvasFlexBox.snippet]
    }
  ]
}
