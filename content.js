document.addEventListener("click", () => {
  console.log("Content script clicked!");
});

const startIndeed = () => {
  startScriptButton();

  // non searching page
  const getJobCards = document.getElementById("mosaic-provider-jobcards-1");
  // searching page
  const searchJobCards = document.getElementById("mosaic-jobResults");
  // make conditional to check which page we are on
  const btn = document.getElementById("startbtn");

  btn.addEventListener("click", () => {
    // Log the job cards container
    console.log(getJobCards);

    // Dynamically get job card data
    // Search vs non search page logic
    if (getJobCards) {
      // if they don't search for a job ( scrapes the home page)
      jobCardScrape(getJobCards);
    } else if (searchJobCards) {
      // if they search for a job (scrapes the search results page)
      // jobCardScrape(searchJobCards);

      autoScrollToBottom(() => {
        console.log("You have hit the bottom of the webpage!");
        jobCardScrape(searchJobCards);
      });
    }
  });

  // searching page logic
  // mosaic-jobResults search id
};

function indeedMain() {
  new Promise((resolve) => {
    const checkExist = setInterval(() => {
      if (document.getElementById("MosaicProviderRichSearchDaemon")) {
        clearInterval(checkExist);
        resolve();
      }
    }, 100);
  })
    .then(() => {
      startIndeed();
    })
    .catch((err) => {
      console.log(err);
    });
}

setTimeout(() => {
  indeedMain();
}, 2000);

// sgets job card data
// ...existing code...
const jobCardScrape = async (getJobCards) => {
  console.log('Starting jobCardScrape...');
  const jobs = scrapePage(getJobCards);
  console.log('Current page jobs:', jobs);
};
// ...existing code...
const startScriptButton = () => {
  const searchForm = document.getElementById("MosaicProviderRichSearchDaemon");
  const startbtn = document.createElement("button");
  startbtn.innerText = "Start";
  startbtn.style.height = "30px";
  startbtn.style.width = "60px";
  startbtn.style.backgroundColor = "blue";
  startbtn.style.color = "white";
  startbtn.style.borderRadius = "5px";
  startbtn.style.border = "none";
  startbtn.style.cursor = "pointer";
  startbtn.style.marginLeft = "10px";
  startbtn.id = "startbtn";
  searchForm.appendChild(startbtn);
};

const scrapePage = (getJobCards) => {
  console.log('scrapePage called...');
  const jobCards = getJobCards?.querySelectorAll("ul > li");
  if (!jobCards) {
    console.log('No job cards found on this page.');
    return [];
  }
  const jobs = [];
  jobCards.forEach((card, idx) => {
    // Get job title
    const jobTitle = card.querySelector("h2.jobTitle span")?.textContent?.trim() || null;
    // Get company name
    const companyName = card.querySelector('[data-testid="company-name"]')?.textContent?.trim() || null;
    // Get location
    const location = card.querySelector('[data-testid="text-location"]')?.textContent?.trim() || null;
    // Get company description
    const companyDesc = card.querySelector(".jobMetaDataGroup")?.innerText?.trim() || null;
    // Get job link and id
    const jobLinkEl = card.querySelector("h2.jobTitle a");
    const jobLink = jobLinkEl?.href || null;
    const jobId = jobLinkEl?.getAttribute("data-jk") || jobLinkEl?.id || null;
    const jobType = card.querySelector('[data-testid="indeedApply"]')?.textContent?.trim() || null;
    if ([jobTitle, companyName, location, companyDesc, jobLink, jobId,jobType].some((val) => val === null || val === undefined)) {
      console.log(`Skipping incomplete job card at index ${idx}.`);
      return;
    }
    jobs.push({
      jobTitle,
      companyName,
      location,
      companyDesc,
      jobLink,
      jobId,
      jobType
    });
    console.log(`Job card ${idx} scraped:`, jobs[jobs.length - 1]);
  });
  console.log(`scrapePage finished. ${jobs.length} jobs found.`);
  return jobs;
};

function autoScrollToBottom(callback) {
  let lastScrollTop = -1;
  function scrollStep() {
    window.scrollBy(0, 100);
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.body.offsetHeight;
    if (
      scrollTop + windowHeight >= documentHeight - 5 ||
      scrollTop === lastScrollTop
    ) {
      // At bottom or can't scroll further
      if (typeof callback === "function") callback();
      return;
    }
    lastScrollTop = scrollTop;
    setTimeout(scrollStep, 80);
  }
  scrollStep();
}
