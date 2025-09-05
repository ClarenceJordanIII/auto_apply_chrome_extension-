






document.addEventListener("click", () => {
    console.log("Content script clicked!");
  
});

const startIndeed = (() => {
startScriptButton()
});

function indeedMain () {
    new Promise((resolve) => {
        const checkExist = setInterval(() => {
            if (document.getElementById('MosaicProviderRichSearchDaemon')) {
                clearInterval(checkExist);
                resolve();
            }
        }, 100);
    }).then(() => {
        startIndeed();
    }).catch((err) => {
        console.log(err);
    })
}

setTimeout(() => {
    indeedMain();
}, 2000);














 const startScriptButton = ()=>{
        const searchForm = document.getElementById('MosaicProviderRichSearchDaemon')
    const startbtn = document.createElement('button')
    startbtn.innerText = "Start"
    startbtn.style.height = "30px"
    startbtn.style.width = "60px"
    startbtn.style.backgroundColor = "blue"
    startbtn.style.color = "white"
    startbtn.style.borderRadius = "5px"
    startbtn.style.border = "none"
    startbtn.style.cursor = "pointer"
    startbtn.style.marginLeft = "10px"
    startbtn.id = "startbtn"
    searchForm.appendChild(startbtn)
}