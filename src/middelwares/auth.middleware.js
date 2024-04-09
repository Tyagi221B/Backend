//This middelware will verify, that there is user or not.

import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import jwt from "jsonwebtoken"
import { User } from "../models/user.model.js";


export const verifyJWT = asyncHandler(async(req, _, next) => {
    // Attempt to retrieve the access token from either cookies or the Authorization header
    try {

        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
        // yha par req ke pass bhi cookies ka access hai, that is given by app.use(cookieParser()), in app.js file.
        // The access token can potentially come from either the frontend (web browser) or the backend (custom native application). Web browsers typically send tokens in cookies, so we check `req.cookies.accessToken` first. If not available, we check the `Authorization` header for a Bearer token format ("Authorization: Bearer <token>") and extract the actual token by removing the "Bearer " prefix. This flexible approach allows our API to handle authentication from various client applications.

        if(!token){
            throw new ApiError(401, "Unauthorized request")
        }

        // Verify the token using the secret key from the environment variable
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

        // Find the user associated with the decoded token ID, excluding password and refresh token from the retrieved user data
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
    
        // If the user is not found based on the decoded token, throw an unauthorized error
        if(!user){
            throw new ApiError(401, "Invaild Access Token")
        }
    
         // Attach the retrieved user data to the request object for use in logoutUser.
        req.user = user;

        //If everything is successfull, proceed.
        next();



    } catch (error) {

        throw new ApiError(401, error?.message || "Invalid access token")

    }


})

