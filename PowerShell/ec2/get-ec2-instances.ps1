
####################################################################################################################################
# AQuintal 3/9/18                                                                                                                  #
#                                                                                                                                  #
# Display all deployed EC2 instances in all AWS Organizations and output each Organization and Region to a csv file to view        #
# Must have AWS CLI installed on machine as well as \.aws\config file configured with appropriate region/org ID's for this to run  #
#                                                                                                                                  #
####################################################################################################################################

#Define an array of all Orgs (located in AWS CLI /.aws/config profile)
$awsOrgs = "ORG01", "ORG02"

#Create an array of all EC2 regions and store in an array called ec2Regions
$ec2RegionsList = aws ec2 describe-regions
$ec2RegionsObj = $ec2RegionsList | ConvertFrom-Json
$ec2Regions = $ec2RegionsObj.Regions.RegionName

#Cycle through each org within array 
foreach ($org in $awsOrgs)
 {

#Cycle through each region for each org, and query ec2 data. 
    foreach ($region in $ec2Regions)
    {

    Write-Host "Currently gathering EC2 data from:" "AWS Org" $org "and AWS Region:" $region -ForegroundColor Green

#Query for State, InstanceType, Department, EC2 Name
   aws ec2 describe-instances --profile $org --region $region --query 'Reservations[*].Instances[*].{InstanceType:InstanceType, EC2Status:State.Name, Name:Tags[?Key==`Name`].Value|[0], Department:Tags[?Key==`Department`].Value|[0]}' --output text | Out-File  C:\EC2\$org-$region.csv

    }

}
Write-Host "All Regions and Orgs have been searched" -ForegroundColor Blue


#This portion of the script removes all of the empty csv files that were created. 
#These csv files were created due to the script searching through every Org/Region. 
#Set Directory to where you are creating the files
$Dir = "C:\EC2"

#If the file is smaller or equal to 10Bytes (default size of empty json file with two []) then delete
Get-ChildItem -Path $Dir -Recurse | Where-Object { $_.Length -le 10 } | Remove-Item -Force

Set-Location C:\EC2

#Merge all csv files into one single file stored in C:\Test

CMD /C "copy *.csv ec2Instances1.csv"

Write-Host "All files have been merged into C:\EC2\ec2Instances.csv" -ForegroundColor Yellow


Get-ChildItem "C:\EC2\*.csv" | ForEach-Object{[System.IO.File]::("C:\EC2new.csv",[System.IO.File]::ReadAllText($_.FullName) + [System.Environment]::NewLine)}
