variable "IMAGE_NAME" {
  default = "ghcr.io/aopslab/aops-community"
}

variable "IMAGE_TAG" {
  default = "dev"
}

variable "SOURCE_DATE_EPOCH" {
  default = "0"
}

target "community" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms = [
    "linux/amd64",
    "linux/arm64",
  ]
  tags = ["${IMAGE_NAME}:${IMAGE_TAG}"]
  args = {
    BUILDKIT_MULTI_PLATFORM = "1"
    SOURCE_DATE_EPOCH       = "${SOURCE_DATE_EPOCH}"
  }
  # Keep attestations detached from this index: Buildx attestation manifests
  # carry invocation metadata and would make the top-level runtime digest vary.
  # release.json binds the separately signed SBOM and provenance references.
  attest = [
    "type=provenance,disabled=true",
    "type=sbom,disabled=true",
  ]
  output = [
    "type=oci,dest=dist/aops-community-${IMAGE_TAG}.oci,tar=false,oci-mediatypes=true,rewrite-timestamp=true",
  ]
}
