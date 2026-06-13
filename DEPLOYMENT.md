# Deployment Guide

This guide explains how to deploy the Meal Management System to cloud hosting platforms with a persistent database.

## Option 1: Render.com (Recommended & Easiest)

Render can build and run this application automatically from its `Dockerfile` and keep your database safe using a persistent disk.

### Steps to Deploy:
1. Push this project to your GitHub repository: `https://github.com/sanzid1367/Meal_Management_System`.
2. Sign up or log in to [Render](https://render.com).
3. Click **New > Blueprint Route** (or select **Blueprints** from the top nav).
4. Connect your GitHub account and select the `Meal_Management_System` repository.
5. Render will automatically read the `render.yaml` file from the repository and configure:
   - A Web Service running on a free tier.
   - A persistent 1GB disk named `meal-db-data` mounted at `/data`.
   - The environment variable `MEAL_DB_PATH` set to `/data/meal_manager.db`.
6. Click **Approve** to create the service.
7. Render will build the Docker image and deploy it. Once complete, you will receive a public URL (e.g., `https://meal-management-system.onrender.com`) that you can share with members!

---

## Option 2: Railway.app

Railway is another excellent, developer-friendly cloud hosting platform.

### Steps to Deploy:
1. Push the project to your GitHub repository.
2. Sign up or log in to [Railway](https://railway.app).
3. Click **New Project** > **Deploy from GitHub repo** and select `Meal_Management_System`.
4. Once the service is created, go to the service settings:
   - Click on **Volumes** > **Add Volume** to mount a persistent disk (e.g. mount path `/data`).
   - Click on **Variables** and add a new environment variable:
     - **Key:** `MEAL_DB_PATH`
     - **Value:** `/data/meal_manager.db`
5. Railway will redeploy the service automatically.
6. Generate a public domain under **Settings > Networking > Generate Domain**.
