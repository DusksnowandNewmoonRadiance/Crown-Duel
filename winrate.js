/* 终端入口；网页与终端共用同一套胜率模拟逻辑。 */
const Winrate=module.exports=require("./public/js/winrate-core.js");
if(require.main===module)Winrate.runCli(process.argv);
