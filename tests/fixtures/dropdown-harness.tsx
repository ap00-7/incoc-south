import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Dropdown } from "../../src/components/dropdown";
import "../../src/globals.css";

function DropdownHarness() {
  const [language, setLanguage] = useState("");
  return <main style={{ minHeight: "200vh", padding: 16 }}>
    <label htmlFor="test-language">Language</label>
    <div style={{ marginTop: "calc(100vh - 95px)", maxWidth: 360 }}>
      <Dropdown
        id="test-language"
        value={language}
        options={[
          { label: "All languages", value: "" },
          { label: "English", value: "English" },
          { label: "Hindi", value: "Hindi" },
          { label: "Kannada", value: "Kannada" },
          { label: "Tamil", value: "Tamil" },
        ]}
        onValueChange={setLanguage}
      />
    </div>
    <output data-testid="selected-language">{language || "All languages"}</output>
    <button id="outside-menu" type="button">Outside menu</button>
  </main>;
}

createRoot(document.getElementById("root")!).render(<DropdownHarness />);
