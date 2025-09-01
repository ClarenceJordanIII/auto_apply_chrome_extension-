import { useState, useEffect } from "react";
import {get_current_tab} from "./utils/currenttab"
import "./app.css";

export function App() {
  const [url, setUrl] = useState<string | undefined | void>(undefined);
  
  useEffect(() => {
    const fetchData = async () => {
      const currentTab: string | undefined = await get_current_tab();
      setUrl(currentTab);
    };
    
    fetchData();
   
  }, []);

  return (
    <>

    
      <h1 class="text-3xl font-bold underline">Hello world! {url}</h1>
      
    </>
  );
}
