import assert from 'assert';
import IndexedImage from './indexed_image';
import DockerImage from './docker_image';

/**
 * Image Manager is responsible for ensuring that an image is downloaded
 * and available for a task.  A secondary goal of the image manager is to ensure
 * that only one download of an image happens at a time.  Parallel downloads/loading
 * of docker images has been problematic.
 */
export default class ImageManager {
  /*
   * @param {Object} runtime - Runtime object that's typically created by the worker.
   *                           Requires a logging and docker instance.
   */
  constructor(runtime) {
    assert(runtime.docker, 'Docker instance must be provided');
    this.runtime = runtime;
    this.docker = runtime.docker;
    this.log = runtime.log;
    this._lastImageEnsured = null;
  }

  /*
   * Ensures that an image is available for a task.  This image could be an indexed
   * image (type: indexed-image) or a docker image.
   *
   * Example Docker Image (backwards compatability):
   * imageDetails = 'ubuntu:14.04'
   *
   * Example Docker Image:
   * imageDetails = {
   *   type: 'docker-image',
   *   name: 'ubuntu:14.04'
   * }
   *
   * Example Indexed Image:
   * imageDetails = {
   *   type: 'indexed-image',
   *   namespace: 'public.images.ubuntu.14_04',
   *   path: 'public/image.tar'
   * }
   *
   *
   * @param {Object|String} imageDetails - Object or string represent
   *
   * @returns {Object} promise - Returns a promise that either is immediately resolved
   *                             or will be once image is downloaded.  Ensures
   *                             pulls/downloads are done serially.
   */
  async ensureImage(imageDetails, stream, scopes = []) {
    if (typeof imageDetails === 'string') {
      imageDetails = {
        name: imageDetails,
        type: 'docker-image'
      };
    }

    return this._lastImageEnsured = Promise.resolve(this._lastImageEnsured)
      .catch(() => {}).then(async () => {
        this.log('ensure image', {
         image: imageDetails
        });

        let imageHandler = this.getImageHandler(imageDetails, stream, scopes);
        let exists = await imageHandler.imageExists();

        if (!exists) {
          await imageHandler.download();
        }

        return imageHandler.imageId;
      });
  }

  /*
   * Creates the appropriate image handler for the 'type' requested.
   *
   * @param {Object} image  - Image details including 'type'
   * @param {Object} stream - Stream object used for piping messages to the task log
   * @param {Array}  scopes - Array of task scopes
   */
  getImageHandler(image, stream, scopes) {
    let handler;
    if (image.type === 'docker-image') {
      handler = new DockerImage(this.runtime, image, stream, scopes);
    } else if (image.type === 'indexed-image') {
      handler = new IndexedImage(this.runtime, image, stream, scopes);
    } else {
      throw new Error(`Unrecognized image type. Image Type: ${image.type}`);
    }

    return handler;
  }
}