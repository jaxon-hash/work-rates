@echo off
echo 🚀 Starting Deployment to jxnn.store...

git add .
:: The '|| ver > nul' allows the script to continue even if there are no new changes to commit
git commit -m "Update portfolio: %date% %time%" || ver > nul
echo.
echo 📥 Syncing changes from other devices...
git pull origin main --rebase
echo 📤 Uploading to GitHub...
git push origin main
echo ✅ Changes have been pushed to GitHub!
pause