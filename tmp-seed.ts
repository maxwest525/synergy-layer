const r = await fetch("https://api.firecrawl.dev/v2/scrape", { method:"POST", headers:{Authorization:`Bearer ${process.env["FIRECRAWL_API_KEY"]}`,"Content-Type":"application/json"}, body: JSON.stringify({url:"https://trumoveinc.com",formats:["markdown"],onlyMainContent:true})});
const j:any = await r.json();
console.log("status", r.status, "title", j?.data?.metadata?.title ?? j?.metadata?.title);
const md = j?.data?.markdown ?? j?.markdown ?? "";
console.log(md.split("\n").filter((l:string)=>/^#{1,3}\s/.test(l)).slice(0,12).join("\n"));
