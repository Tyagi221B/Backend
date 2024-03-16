import multer from "multer";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./public/temp");
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
        //print this file , see what is in it 
        //giving originalname here is not a good practise , because many files can be of same name . but we can do this here because at server the file is goining to be for a very less time 
        
    },
});

export const upload = multer({
    storage, // can also write it as { storage : storage}
});
