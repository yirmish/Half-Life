# Half-Life
Radioactive Decay Calculator

This project provides an intuitive, user-friendly HTML calculator designed to compute the radioactive decay of substances based on their half-life. It helps in quickly determining the remaining quantity of a radioactive isotope after a certain elapsed time, following the fundamental principles of nuclear physics.

## Features

* **Intuitive User Interface:** Clear, responsive, and easy-to-use layout.
* **Flexible Inputs:** Enter the initial quantity, half-life value, and elapsed time.
* **Unit Selection:** Supports Bq (up to TBq), Ci and Rd, with automatic conversions. Results are shown first in the unit you chose, then in the other units.
* **A Unit for Every Activity Field:** The residual, target and desired activities each have their own unit menu (e.g. initial activity in MBq, residual measured in µCi). They follow the initial unit until you pick another one; under each field the value is also shown in the initial unit. A value without a unit cannot be mixed with one in Bq or Ci; the page says so under the field.
* **Live Results:** Once you calculate a result it stays up to date: changing any input recalculates it, and "Current Activity" refreshes every second.
* **Predefined Isotopes:** Includes a comprehensive list of common isotopes used in nuclear medicine, selectable via a dropdown (with each half-life shown).
* **Custom Half-Life Input:** Allows entering custom half-life values and selecting corresponding time units.
* **"Now" Buttons:** Fill any date/time field with the current time in one click.
* **Decay Summary:** Every result shows the elapsed time, the number of half-lives and the fraction remaining.
* **Responsive Design:** Adapts seamlessly to various screen sizes and devices.
* **Theme Selector:** Switch between "Clean" and "Radioactive" themes for improved visibility and user preference.
* **Residual Activity Consideration:** Option to account for residual activity in a syringe after injection. Useful when initial activity is measured from the syringe before injection, and a subsequent measurement indicates residual activity. The injected activity is shown explicitly.
* **Activity Concentration Calculation:** Capability to calculate activity concentration or activity based on partial volumes, helpful when drawing only a portion of the radioactive substance from a vial.
* **Volume to Draw for a Desired Dose:** Enter the dose you need at administration time and get the volume to draw from the vial, plus the reading the dose calibrator should show right now (updated every second).
* **Decay Table:** Activity at regular intervals (any start time, interval and number of rows), with the row for the current time highlighted. Print it on its own, or copy it as tab-separated text that pastes straight into Excel.
* **Time-Interval Mode:** Calculate the activity a given time after the initial measurement (e.g. "after 48 hours") instead of at a date.
* **Tc-99m Generator Elution:** Expected Tc-99m from a Mo-99/Tc-99m generator: Mo-99 on the column, Tc-99m available and in the eluate (with elution efficiency), the share of the maximum yield and when it peaks. An optional Mo-99 breakthrough check gives the Mo-99/Tc-99m ratio and when it reaches the limit (default 0.15 kBq/MBq). One click loads the eluate into the main calculator as the initial activity.
* **Equations Under Every Result:** Each result shows, in small print, the equation used and the same equation with the actual numbers (e.g. `A(t) = A₀ · (½)^(Δt/T½) = 10.000 mCi · (½)^(5.000 h / 6.0072 h) = 5.612 mCi`), so every value can be checked by hand. The equations are included when a result is copied.
* **Linked Data Sources:** The half-life source of every isotope links to its ENSDF dataset page at NNDC; the generator also links the Mo-99 decay data behind its branching fraction.
* **Copy Results:** Every result has a Copy button that copies a self-contained text summary (isotope, inputs and result) for documentation.
* **Works Offline:** No external scripts; only the web fonts are loaded from Google Fonts, and the page falls back to system fonts without them.

## Usage Instructions

1. **Select Isotope (Optional):**

   * Choose an isotope from the provided dropdown, or select "Custom Half-life" to manually input values.

2. **Enter Initial Activity:**

   * Input the starting quantity of the substance.
   * Select the desired unit (optional).

3. **Specify Half-Life:**

   * Enter the half-life duration.
   * Choose the corresponding time unit (seconds, minutes, hours, days, or years).

4. **Date and Time:**

   * Provide the initial date and time of activity measurement.

5. **Residual Activity (Optional):**

   * Enter residual activity value and measurement time if applicable, such as residuals in a syringe after administration.

6. **Volume and Concentration (Optional):**

   * Input total volume and partial volume if you only drew a portion from a vial to determine activity concentration or the actual activity administered.

7. **Perform Calculations:**

   * Click on "Calculate Current Activity" to display the remaining quantity at the present moment.
   * Optionally calculate the activity at a specific future or past date/time (or a time interval after the initial measurement), or determine when the substance will reach a specified target activity.

8. **Draw a Dose (Optional):**

   * The vial is described by the initial activity (step 2–4). Enter the vial's total volume, the desired activity and the administration time; the calculator gives the volume to draw and the expected dose-calibrator reading now.

9. **Decay Table (Optional):**

   * Choose a start time (or leave it empty to start at the measurement), an interval and the number of rows. Use "Print" for a paper copy or "Copy" to paste it into a spreadsheet.

10. **Generator (Optional):**

   * Enter the Mo-99 activity and calibration time, the last elution (leave empty if not eluted for 2 days) and the elution time. Open "Mo-99 breakthrough check" to check an eluate against the Mo-99 limit, then use "Use This Eluate as the Initial Activity" to continue with dose drawing or a decay table.

## Live Demo

[Live Demo on GitHub Pages](https://yirmish.github.io/Half-Life/)

## Installation and Local Usage

To use this calculator locally:

1. Clone the repository:

   ```bash
   git clone https://github.com/yirmish/Half-Life.git
   ```

2. Navigate to the directory:

   ```bash
   cd Half-Life
   ```

3. Open `index.html` in any modern web browser to start using the calculator immediately. No build step or server is needed; keep the `css/` and `js/` folders next to it.

## Project Structure

```
index.html            Page markup
css/base.css          Layout and components (uses the theme variables)
css/themes.css        "Clean" and "Radioactive" themes, as sets of CSS variables
js/decay-core.js      Calculation core, no DOM: units, decay law, residual/volume scenario, formatting
js/isotopes.js        Isotope half-life table (NNDC)
js/ui-components.js   Reusable UI pieces: Field, FormReader, MessageBox, ToggleSection, ResultPanel
js/theme.js           ThemeManager and the radioactive DotField animation
js/app.js             The calculator page: inputs, the three calculations, CalculatorApp
tests/                Unit tests for the calculation core
```

## Running the Tests

The calculation core runs in Node as well as in the browser. With Node 18 or newer:

```bash
npm test
```

## Changing CSS or JavaScript

`index.html` loads each CSS/JS file with a content hash (`js/app.js?v=…`), so browsers never combine a new page with an old cached script. After editing any of those files, update the hashes (`npm test` fails until you do):

```bash
npm run stamp
```

## Formula and Scientific Background

The calculator uses the following radioactive decay formula:

$N(t) = N_0 \times \left(\frac{1}{2}\right)^{\frac{t}{T}}$

Where:

* $N_0$ is the initial quantity of the substance.
* $T$ is the half-life of the substance.
* $t$ is the elapsed time.
* $N(t)$ is the remaining quantity after time $t$.

A year is taken as a Julian year (365.25 days), the convention used by nuclear-data tables.

**Generator (Mo-99 → Tc-99m).** After a complete elution, Tc-99m grows back as (Bateman):

$A_{Tc}(t) = b \cdot \frac{\lambda_{Tc}}{\lambda_{Tc} - \lambda_{Mo}} \cdot A_{Mo}(t_{elution}) \cdot \left(e^{-\lambda_{Mo} t} - e^{-\lambda_{Tc} t}\right)$

It peaks about 22.8 h after an elution. Without a last elution, transient equilibrium is assumed ($A_{Tc} \approx 0.966\,A_{Mo}$). The branching fraction $b = 0.8778$ is computed from ENSDF (Browne & Tuli, 2017): 82.2% direct beta feeding of the 142.68 keV isomer plus 5.58% through gamma cascades (uncertainty ± 0.4%). It can be changed under "Advanced".

With a residual measurement, the injected activity is the initial activity decayed to the residual measurement time, minus the residual activity. All later results decay from that point.

## Scientific References

The half-life values used in this calculator are the ENSDF adopted (evaluated) values published by the [National Nuclear Data Center (NNDC)](https://www.nndc.bnl.gov/nudat3/) — the "Adopted Levels" dataset of each nuclide. `js/isotopes.js` lists, for every isotope, the evaluated value with its uncertainty and the Nuclear Data Sheets reference it comes from; the calculator shows this when an isotope is selected.

When an isotope is selected, the calculator links to that page (e.g. [Tc-99m](https://www.nndc.bnl.gov/nudat3/getdataset.jsp?nucleus=99Tc&unc=NDS)).

The table was last checked against NNDC on 2026-11-13 (all 41 values match). To re-check it after new evaluations are published (needs network access to www.nndc.bnl.gov):

```bash
npm run verify-isotopes
```

Note that the summary data behind the NuDat 3 interactive chart differs from the ENSDF adopted values for several isotopes (for example Cs-137: 30.007 y vs 30.08 y; Ga-68: 67.843 min vs 67.71 min). This calculator follows the ENSDF adopted values, which are the formally evaluated and published ones.

## Technologies Used

* HTML
* CSS (Tailwind CSS)
* JavaScript

## Contributing

Contributions are welcome! Feel free to improve the calculator’s UI, fix bugs, enhance performance, or add additional features such as:

* Support for multiple sequential decay chains.
* Visualization of decay graphs.
* Export functionality (PDF, CSV).

Please fork the repository and submit pull requests with your enhancements.

## License

This project is licensed under the MIT License, allowing you to freely use, modify, and distribute the code.

## Optional Enhancements

Future improvements might include:

* Export results in CSV or PDF formats.
* A decay curve chart.
* Persistence of previous calculations using local storage.

Thank you for checking out this calculator!
