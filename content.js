






document.addEventListener("click", () => {
    console.log("Content script clicked!");
  
});

const startIndeed = (() => {
startScriptButton()

// non searching page
const getJobCards = document.getElementById("mosaic-provider-jobcards-1")
// searching page 
const searchJobCards = document.getElementById("mosaic-jobResults")
// make conditional to check which page we are on
const btn = document.getElementById("startbtn")
btn.addEventListener("click", () => {
    // Log the job cards container
    console.log(getJobCards);

    // Dynamically get job card data
    const jobCards = getJobCards?.querySelectorAll('ul > li');
    jobCards?.forEach(card => {
        // Get job title
        const jobTitle = card.querySelector('h2.jobTitle span')?.textContent?.trim() || null;
        // Get company name
        const companyName = card.querySelector('[data-testid="company-name"]')?.textContent?.trim() || null;
        // Get location
        const location = card.querySelector('[data-testid="text-location"]')?.textContent?.trim() || null;
        // Get company description
        const companyDesc = card.querySelector('.jobMetaDataGroup')?.innerText?.trim() || null;
        // Get job link and id
        const jobLinkEl = card.querySelector('h2.jobTitle a');
        const jobLink = jobLinkEl?.href || null;
        const jobId = jobLinkEl?.getAttribute('data-jk') || jobLinkEl?.id || null;

       
        if ([jobTitle, companyName, location, companyDesc, jobLink, jobId].some(val => val === null || val === undefined)) {
            return;
        }
        console.log({ jobTitle, companyName, location, companyDesc, jobLink, jobId });
    });
})


// searching page logic 
// mosaic-jobResults search id


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