import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {
    deleteOldFileFromCloudinary,
    uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(
            500,
            "something went wrong while generating refresh and access token"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    //get user details from frontend
    //validation - not empty
    //check if user already exists: username , email
    //check for images, check for avatar
    //upload them to cloudinary, avatar
    //create user object - create entry in db  {it's a NoSql database and mostly we create objects in it <-- check this statement }
    //remove password and refresh token field from response
    //check for user creation
    // return response

    const { fullName, email, username, password } = req.body;
    // console.log("email: ", email);

    if (
        [fullName, email, username, password].some(
            (field) => field?.trim() === ""
        )
    ) {
        throw new ApiError(400, "All field are required");
    }
    // TODO: try to write more validations like if email includes @ or not and many more

    const existedUser = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    ) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    // console.log(avatar);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required");
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
        avatarPublicId: avatar.public_id,
    });

    //removing password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(
            500,
            "Something went wrong while registering the user"
        );
    }

    return res
        .status(201)
        .json(
            new ApiResponse(200, createdUser, "User registered Successfully")
        );
});

const loginUser = asyncHandler(async (req, res) => {
    //req data from body
    //check if the user with either username or email already exists in the database or not
    //find the user, if not then User does not exist.
    //if user exits then do password check
    //generate access and refresh token
    //remove sesitive information from the loggedIn user data
    //send cookie

    const { email, username, password } = req.body;
    if (!username && !email) {
        throw new ApiError(400, "username or email is required");
    }

    //Find the user by email or username in the database
    const user = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    //Check if the provided password matches with the user's password
    const isPasswordvalid = await user.isPasswordCorrect(password);

    if (!isPasswordvalid) {
        throw new ApiError(401, "Invaild user credentials");
    }

    //Generate access and refresh tokens for the user
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
        user._id
    );

    //Retrive logged-in user data without sensitive information
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    //Options for setting cookies
    const options = {
        httpOnly: true, // Cookie accessible only via HTTP(S)
        secure: true, // Cookie sent only over HTTPS
    };

    //Send response with the cookies and user data
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "User logged in Successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    User.findByIdAndUpdate(
        req.user._id, // Using the user ID from the request(req) object which is set by verifyJWT middleware.

        {
            $set: {
                refreshToken: undefined, // Set the user's refresh token to undefined to prevent further use
            },
        },
        {
            new: true,
        }
    );

    const options = {
        httpOnly: true, //Prevent client-side JavaScript access to the cookie
        secure: true, // Only send the cookie over HTTPS connections
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out Successfully "));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies.refreshToken || req.body.refreshToken;
         //clients that might choose to send the refresh token in the request body instead(Like mobile applications).

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const options = {
            httpOnly: true,
            secure: true,
        };

        const { accessToken, newRefreshToken } =
            await generateAccessAndRefreshTokens(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed"
                )
            );
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

const changeCurrentPassoword = asyncHandler(async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        // console.log(oldPassword, newPassword);
    
        const user = await User.findById(req.user?._id);
    
        const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

        if (!isPasswordCorrect) {
            throw new ApiError(400, "Invalid old password");
        }
    
        user.password = newPassword;
    
        await user.save({ validateBeforeSave: false });
    
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Password changed successfully"));

    } catch (error) {
        throw new ApiError(400, error?.message || "Error updating password")
    }
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    try {
        const { fullName, email, username } = req.body;
        // console.log(email);
    
        if (!fullName || !email || !username) {
            throw new ApiError(400, "All fields are required");
        }
        //TODO:check if the username is already exist in the database or not.
        //Todo:check if the email is already exist in the database or not.
        //Todo: do email validation, weather the email is in the correct format or not.
    
        const user = await User.findByIdAndUpdate(
            req.user?._id,
            {
                $set: {
                    fullName: fullName,
                    email: email,
                    username: username.toLowerCase(),
                },
            },
            { new: true }
        ).select("-password");
    
        return res
            .status(200)
            .json(
                new ApiResponse(200, user, "Account details updated successfully")
            );
    } catch (error) {
        throw new ApiError(200, error?.message || "Error updating account details")
    }
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path; // we have req.file because of multer

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading avatar to cloudinary");
    }

    const userId = req.user?._id;

    const user = await User.findById(userId);

    //now updating the user's avatar url and avatarPublicId in the database
    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
                avatarPublicId: avatar.public_id,
            },
        },
        { new: true }
    ).select("-password");

    //if update is successful and there is a previous avatar URL, delete the old avatar from cloudinary
    if (user?.avatarPublicId) {
        try {
            await deleteOldFileFromCloudinary(user?.avatarPublicId);
        } catch (error) {
            throw new ApiError(
                400,
                "Error while deleting old avatar from cloudinary"
            );
        }
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path; // we have req.file because of multer

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    //checking if the upload to the cloudinary was successful
    if (!coverImage.url) {
        throw new ApiError(
            400,
            "Error while uploading cover image to cloudinary"
        );
    }

    //Get currently logged-in user's ID
    const userId = req.user?._id;

    //getting the user object
    const user = await User.findById(userId);

    //get the old cover image URL from the user object
    const previousCoverImageUrl = user?.coverImage.url;

    //now updating the user's cover image url in the database
    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            },
        },
        { new: true }
    ).select("-password");

    //if update is successful and there is a previous cover image URL, delete the old cover image from cloudinary
    if (previousCoverImageUrl) {
        try {
            await deleteOldFileFromCloudinary(previousCoverImageUrl);
        } catch (error) {
            
        }
    }

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {

    const {username} = req.params
    if(!username?.trim()) {
        throw new ApiError(400, "Username is missing")
    }


    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup:{
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]}
                    }
                }
            }
        },
        {
            $project: {
                username: 1,
                fullName: 1,
                email: 1,
                avatar: 1,
                coverImage: 1,
                isSubscribed: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1
            }
        }
    ])

    //TODO: print this channel

    if(!channel?.length){
        throw new ApiError(404, "Channel not found")
    }

    return res
    .status(200)
    .json(new ApiResponse(200, channel[0], "Channel fetched successfully"))


})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(new ApiResponse(200, user[0].watchHistory, "Watch history fetched successfully"))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassoword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
};
