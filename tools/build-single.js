/* 把 index.html + css + js 合成一个单文件。
 * 用法：
 *   node tools/build-single.js dist/xiaoguan.html            完整单文件（可直接发给别人、放进任意静态托管）
 *   node tools/build-single.js out.html --fragment           不带 <html>/<head>/<body> 的片段（嵌入到已有页面骨架里用）
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2];
const fragment = process.argv.includes('--fragment');
if (!out) {
  console.error('用法：node tools/build-single.js <输出文件> [--fragment]');
  process.exit(1);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const scripts = [];
const markup = body.replace(/<script src="([^"]+)"><\/script>\s*/g, (_, src) => {
  scripts.push(fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/g, '<\\/script'));
  return '';
});
const js = scripts.map((s) => '<script>\n' + s + '\n</script>').join('\n');
let page;
if (fragment) {
  const font = (html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/) || [''])[0];
  page = '<title>一间小馆</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + font + '\n<style>\n' + css + '\n</style>\n' + markup.trim() + '\n' + js + '\n';
} else {
  const head = html.slice(0, html.indexOf('<link rel="stylesheet"'));
  page = head + '<style>\n' + css + '\n</style>\n</head>\n<body>' + markup + js + '\n</body>\n</html>\n';
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, page);
console.log('已生成 ' + out + '（' + (page.length / 1024).toFixed(0) + ' KB）');
