
const Indded = () => {

const openNewWindow = (link:string) =>{
    window.open(link, "_blank");

}



  return (
    <div>
        <button onClick={() => openNewWindow("https://www.indeed.com")} className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'>Indeed</button>
    </div>
  )
}

export default Indded