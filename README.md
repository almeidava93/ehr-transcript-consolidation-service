# EHR and transcript consolidation service

## Overview

This service is a REST API that delivers notifications given new transcript spans and the current state of a patient's EHR.

## Endpoints

### 1. `/v1/predict`

This is the main endpoint of the service. It receives a transcript span and the current state of the EHR data, and returns a list of zero or more notifications related to information conflict between the transcript and the EHR data.

**Requirements:**

* Client should be able to choose which LLM provider to use on the inference

### 2. `/health`

Confirms the process is running.

### 3. `/metrics`

Returns useful metrics related to the application.

### 4. `/version`

Returns useful information related to the application deployed, including API version, build time-stamp, git commit. 