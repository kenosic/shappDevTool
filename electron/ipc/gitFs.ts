/**
 * isomorphic-git FS adapter using Node.js fs module.
 * This provides the filesystem interface that isomorphic-git expects.
 */
import * as nodeFs from "fs";

export const fs = {
  promises: {
    readFile: nodeFs.promises.readFile,
    writeFile: nodeFs.promises.writeFile,
    unlink: nodeFs.promises.unlink,
    readdir: nodeFs.promises.readdir,
    mkdir: nodeFs.promises.mkdir,
    rmdir: nodeFs.promises.rmdir,
    stat: nodeFs.promises.stat,
    lstat: nodeFs.promises.lstat,
    readlink: nodeFs.promises.readlink,
    symlink: nodeFs.promises.symlink,
    chmod: nodeFs.promises.chmod,
  },
};
