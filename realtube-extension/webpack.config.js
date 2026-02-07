const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env) => {
  const browser = env.browser || "chrome";
  const outDir = path.resolve(__dirname, "dist", browser);

  return {
    mode: "production",
    devtool: "source-map",
    entry: {
      background: "./src/background/background.ts",
      content: "./src/content/content.ts",
      popup: "./src/popup/popup.tsx",
      options: "./src/options/options.tsx",
    },
    output: {
      path: outDir,
      filename: "[name].js",
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "[name].css",
      }),
      new CopyPlugin({
        patterns: [
          {
            from: `src/manifest.${browser}.json`,
            to: "manifest.json",
          },
          {
            from: "src/popup/popup.html",
            to: "popup.html",
          },
          {
            from: "src/options/options.html",
            to: "options.html",
          },
          {
            from: "src/icons",
            to: "icons",
            noErrorOnMissing: true,
          },
        ],
      }),
    ],
    optimization: {
      splitChunks: false,
    },
  };
};
