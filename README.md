# Fairway Log

A phone-friendly golf shot tracker and 18-hole scorecard. This package runs on GitHub Pages with no build command, dependencies or backend.

## Publish to GitHub Pages

1. Create a repository named `fairway-log` or choose an existing repository you want to use for this app. On GitHub Free, Pages is available for public repositories.
2. Extract the ZIP. Upload its contents to the root of the `main` branch, with `index.html` directly in the root. If you use GitHub's website, choose **Add file → Upload files**, select the extracted files and commit the changes. The optional empty `.nojekyll` file bypasses Jekyll. Include it if your upload tool shows hidden files.
3. Go to **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/(root)`, then save. If you use a different branch, choose that branch.
4. After deployment, open the HTTPS URL shown under **Settings → Pages**. For a typical project it looks like `https://YOUR-USERNAME.github.io/fairway-log/`. Use that URL in Safari on your iPhone.

[GitHub Pages publishing guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Set up the map

The shot plot and individual **Open in Google Maps** links work immediately. For an in-app satellite map with your shot path, enable **Maps JavaScript API** in Google Cloud and create a browser API key. Restrict the key to your website origin (for example, `https://YOUR-USERNAME.github.io/*`) and to **Maps JavaScript API**. Paste the key into **Settings** inside the app. The key is saved on that device. Keep it out of the repository and any screenshots.

[Google Maps JavaScript API key setup](https://developers.google.com/maps/documentation/javascript/get-api-key)

## Test before your round

- In Safari, open the live URL. For Home Screen access, choose **Share → Add to Home Screen → Open as Web App** and open the icon. Use that same app or browser for the whole test.
- Start a test round outdoors and allow location access. If iOS offers a **Precise Location** setting for this app or Safari Websites, enable it. Tap **Mark shot** and wait for the accuracy estimate and confirmation.
- Walk far enough to clearly exceed the reported GPS error, capture a second point, and check both pins on the plot. Enter a score, move to the next hole, then reopen the round from **History** and verify your shots and score.
- Open the app online before heading out so Safari has a chance to cache its files. If you plan to rely on offline access, test reopening your Home Screen app in Airplane Mode beforehand. The in-app Google satellite map needs an internet connection. GPS availability and accuracy depend on the phone and conditions.

The GitHub Pages app is a separate copy from the private hosted version. It stores round history and the map key in your browser on your device. The app does not upload your scorecard or shot history to GitHub. GitHub Pages normally publishes the app files publicly, so do not commit a round CSV, map key or other personal data to the repository. Use **Settings → Export rounds as CSV** for your own records.
