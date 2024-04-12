import { Router } from "express";
import { getCurrentUser, loginUser, logoutUser, refreshAccessToken, registerUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage } from "../controllers/user.controller.js";
import { upload } from "../middelwares/multer.middleware.js";
import { verifyJWT } from "../middelwares/auth.middleware.js";

const router = Router();

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1,
        },
        {
            name: "coverImage",
            maxCount: 1,
        },
    ]),
    registerUser
);

router.route("/login").post(loginUser)

//secured routed
router.route("/logout").post(verifyJWT ,logoutUser)

router.route("/refresh-token").post(refreshAccessToken)

router.route("/current-user").get(getCurrentUser)

router.route("/update-account-details").put(updateAccountDetails)

router.route("/update-user-avatar").post(updateUserAvatar)

router.route("/update-user-cover-image").put(updateUserCoverImage)

export default router;
