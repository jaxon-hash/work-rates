@echo off
echo 🚀 Starting Deployment to jxnn.store...

git add .
git commit -m "Update portfolio: %date% %time%"
echo.
echo 📤 Uploading to GitHub...
git push origin main
echo ✅ Changes have been pushed to GitHub!
pause