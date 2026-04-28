document.querySelector("#openOptions").addEventListener("click", () => {
  if (!globalThis.chrome?.runtime?.openOptionsPage) {
    document.querySelector("p").textContent = "当前页面没有扩展运行环境，请从浏览器扩展管理页加载项目。";
    return;
  }
  chrome.runtime.openOptionsPage();
});
