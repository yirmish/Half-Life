# Half-Life
Radioactive Decay Calculator

This project provides an intuitive, user-friendly HTML calculator designed to compute the radioactive decay of substances based on their half-life. It helps in quickly determining the remaining quantity of a radioactive isotope after a certain elapsed time, following the fundamental principles of nuclear physics.

## Features

* **Intuitive User Interface:** Clear, responsive, and easy-to-use layout.
* **Flexible Inputs:** Enter the initial quantity, half-life value, and elapsed time.
* **Unit Selection:** Supports multiple activity units such as Bq, Ci, and Rd, with automatic conversions.
* **Real-Time Calculations:** Instantly calculates the remaining activity upon entering or modifying inputs.
* **Predefined Isotopes:** Includes a comprehensive list of common isotopes used in nuclear medicine, selectable via a dropdown.
* **Custom Half-Life Input:** Allows entering custom half-life values and selecting corresponding time units.
* **Responsive Design:** Adapts seamlessly to various screen sizes and devices.
* **Theme Selector:** Switch between "Clean" and "Radioactive" themes for improved visibility and user preference.
* **Residual Activity Consideration:** Option to account for residual activity in a syringe after injection. Useful when initial activity is measured from the syringe before injection, and a subsequent measurement indicates residual activity.
* **Activity Concentration Calculation:** Capability to calculate activity concentration or activity based on partial volumes, helpful when drawing only a portion of the radioactive substance from a vial.

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
   * Optionally calculate the activity at a specific future or past date/time or determine when the substance will reach a specified target activity.

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

3. Open `Half-Life_V3.html` in any modern web browser to start using the calculator immediately.

## Formula and Scientific Background

The calculator uses the following radioactive decay formula:

$N(t) = N_0 \times \left(\frac{1}{2}\right)^{\frac{t}{T}}$

Where:

* $N_0$ is the initial quantity of the substance.
* $T$ is the half-life of the substance.
* $t$ is the elapsed time.
* $N(t)$ is the remaining quantity after time $t$.

## Scientific References

The half-life values used in this calculator are sourced from the [National Nuclear Data Center (NNDC)](https://www.nndc.bnl.gov/nudat3/), a reliable repository for nuclear data.

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
* Implementation of dark mode.
* Persistence of previous calculations using local storage.

Thank you for checking out this calculator!
