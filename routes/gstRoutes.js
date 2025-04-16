import express from "express";
import axios from "axios";
import User from "../models/userModel.js";

const router = express.Router();

router.post("/check-exists", async (req, res) => {
  try {
    const { gstin } = req.body;
    const existingGst = await User.findOne({ 'businessDetails.gstNumber': gstin });

    return res.json({
      exists: !!existingGst,
      message: existingGst ? 'GST number already registered' : 'GST number available'
    });

  } catch (error) {
    console.error('Error checking GST existence:', error);
    return res.status(500).json({
      exists: false,
      message: 'Error checking GST number'
    });
  }
});

router.post("/verify-gst", async (req, res) => {
  const { gstin } = req.body;
  const RAPID_API_KEY = process.env.RAPID_API_KEY;
  const RAPID_API_HOST = process.env.RAPID_API_HOST;

  if (!RAPID_API_KEY || !RAPID_API_HOST) {
    return res.status(500).json({
      success: false,
      message: "API configuration is missing",
    });
  }

  try {
    const options = {
      method: 'GET',
      url: `https://${RAPID_API_HOST}/v1/gstin/${gstin}/details`,
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST
      }
    };

    const response = await axios.request(options);

    if (response.status === 200) {
      const responseData = response.data.data;

      const transformedData = {
        legalName: responseData.legal_name,
        tradeName: responseData.trade_name,
        businessType: responseData.business_constitution,
        gstStatus: responseData.status,
        gstinValid: responseData.gstin ? true : false,
        registrationDate: responseData.registration_date,
        lastUpdateDate: responseData.last_update_date || 'N/A',
        natureOfBusiness: responseData.business_activity_nature.join(', '),
        address: responseData.place_of_business_principal.address
          ? `${responseData.place_of_business_principal.address.building_name}, ${responseData.place_of_business_principal.address.street}, ${responseData.place_of_business_principal.address.location}, ${responseData.place_of_business_principal.address.state}, ${responseData.place_of_business_principal.address.pin_code}`
          : 'N/A',
        stateJurisdiction: responseData.state_jurisdiction,
        centerJurisdiction: responseData.centre_jurisdiction,
        gstNumber: responseData.gstin,
        eInvoiceStatus: responseData.e_invoice_status || 'N/A'
      };

      return res.status(200).json({
        success: true,
        data: transformedData
      });
    }

    return res.status(response.status).json({
      success: false,
      message: "Unexpected response from GST verification service",
    });

  } catch (error) {
    console.error("Full error details:", {
      message: error.message,
    });

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "error.response.data?.message" || "GST verification failed",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        details: process.env.NODE_ENV === 'development' ? error.response.data : undefined
      });
    } else if (error.request) {
      return res.status(503).json({
        success: false,
        message: "GST verification service is unavailable",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error during GST verification",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
