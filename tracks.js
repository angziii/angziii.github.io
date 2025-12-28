// 徒步路线数据文件
// 如何添加新路线：
// 1. 使用工具（如 geojson.io）将您的 GPX 文件转换为 GeoJSON。
// 2. 复制生成的 GeoJSON 内容。
// 3. 在下方 TRACK_DATA 数组中添加一个新的对象。
//    格式如下：
//    {
//      name: "路线名称",
//      color: "路线颜色 (例如 #ff0000 表示红色)",
//      data: 粘贴你的 GeoJSON 数据在这里
//    },

const TRACK_DATA = [
    // 示例数据 (并在地图上显示一条简单的线作为演示，您可以删除它)
    {
        name: "示例路线",
        color: "#ff5722", // 橙色
        data: {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [114.182681, 22.354455], // 狮子山附近
                    [114.185, 22.355],
                    [114.188, 22.356]
                ]
            }
        }
    }
];
