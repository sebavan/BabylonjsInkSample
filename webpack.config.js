const path = require("path");

var SRC_DIR = path.resolve(__dirname, "./src");
var DIST_DIR = path.resolve(__dirname, "./www");
var DEV_DIR = path.resolve(__dirname, "./.temp");

 var buildConfig = function(env) {
    var isProd = env.prod;
    return {
        context: __dirname,
        entry: {
            index: SRC_DIR + "/app.ts"
        },
        output: {
            path: (isProd ? DIST_DIR : DEV_DIR) + "/scripts/",
            filename: "[name].js",
            publicPath: "/scripts/",
        },
        devtool: isProd ? false : "source-map",
        devServer: {
            static: ['www']
        },
        resolve: {
            extensions: [".ts", ".js"]
        },
        module: {
            rules: [{
                test: /\.tsx?$/,
                loader: "ts-loader",
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            }]
        },
        mode: isProd ? "production" : "development"
    };
 }

module.exports = buildConfig;